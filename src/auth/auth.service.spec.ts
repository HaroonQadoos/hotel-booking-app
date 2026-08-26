import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { hashResetToken } from './reset-token';

const CURRENT_PASSWORD = 'current-password';
const NEW_PASSWORD = 'brand-new-password';

describe('AuthService', () => {
  let service: AuthService;
  // Argument types are declared on the mocks so reading mock.calls back stays
  // type-checked rather than degrading to `any`.
  let usersService: {
    findByEmail: jest.Mock;
    findByIdWithPassword: jest.Mock;
    findByResetTokenHash: jest.Mock;
    setResetToken: jest.Mock<Promise<void>, [string, string, Date]>;
    replacePassword: jest.Mock<Promise<void>, [unknown, string]>;
  };
  let mailService: {
    sendPasswordResetEmail: jest.Mock<Promise<void>, [string, string]>;
  };
  let config: { get: jest.Mock<string | undefined, [string, string?]> };

  // Real bcrypt, hashed once — the change-password path genuinely compares.
  let currentHash: string;
  beforeAll(async () => {
    currentHash = await bcrypt.hash(CURRENT_PASSWORD, 10);
  });

  const userDoc = () => ({ _id: 'user-1', email: 'guest@example.com' });

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findByIdWithPassword: jest.fn(),
      findByResetTokenHash: jest.fn(),
      setResetToken: jest
        .fn<Promise<void>, [string, string, Date]>()
        .mockResolvedValue(undefined),
      replacePassword: jest
        .fn<Promise<void>, [unknown, string]>()
        .mockResolvedValue(undefined),
    };
    mailService = {
      sendPasswordResetEmail: jest
        .fn<Promise<void>, [string, string]>()
        .mockResolvedValue(undefined),
    };
    // Default: hand back whatever fallback the service asks for.
    config = {
      get: jest.fn((_key: string, fallback?: string) => fallback),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: config },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // The mail-failure and misconfiguration paths log on purpose. Silenced so
    // an expected log cannot be mistaken for a real one in the test output.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forgotPassword', () => {
    // The whole point of the converging branches: a different response for an
    // unknown address would turn this endpoint into a way to discover which
    // addresses have accounts.
    it('answers identically whether or not the account exists', async () => {
      usersService.findByEmail.mockResolvedValueOnce(userDoc());
      const known = await service.forgotPassword({
        email: 'guest@example.com',
      });

      usersService.findByEmail.mockResolvedValueOnce(null);
      const unknown = await service.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(known).toEqual(unknown);
    });

    it('writes nothing and sends nothing for an unknown address', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword({ email: 'nobody@example.com' });

      expect(usersService.setResetToken).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('emails a reset token to a known address', async () => {
      usersService.findByEmail.mockResolvedValue(userDoc());

      await service.forgotPassword({ email: 'guest@example.com' });

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'guest@example.com',
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
    });

    // Ties both sides together: what is stored must be the digest of what was
    // emailed, so a database dump yields no usable link.
    it('stores the digest of the token, never the token itself', async () => {
      usersService.findByEmail.mockResolvedValue(userDoc());

      await service.forgotPassword({ email: 'guest@example.com' });

      const [, storedHash] = usersService.setResetToken.mock.calls[0];
      const [, emailedToken] = mailService.sendPasswordResetEmail.mock.calls[0];

      expect(storedHash).not.toBe(emailedToken);
      expect(storedHash).toBe(hashResetToken(emailedToken));
    });

    it('stores the token against the user who asked', async () => {
      usersService.findByEmail.mockResolvedValue(userDoc());

      await service.forgotPassword({ email: 'guest@example.com' });

      expect(usersService.setResetToken.mock.calls[0][0]).toBe('user-1');
    });

    // Bracketed by the clock either side of the call rather than compared to a
    // single reading, so elapsed time during the call cannot make it flake.
    it('expires the token 15 minutes out by default', async () => {
      usersService.findByEmail.mockResolvedValue(userDoc());

      const before = Date.now();
      await service.forgotPassword({ email: 'guest@example.com' });
      const after = Date.now();

      const [, , expiresAt] = usersService.setResetToken.mock.calls[0];
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 15 * 60_000);
    });

    it('honours a configured expiry window', async () => {
      config.get.mockImplementation((key: string, fallback?: string) =>
        key === 'PASSWORD_RESET_EXPIRES_IN' ? '30' : fallback,
      );
      usersService.findByEmail.mockResolvedValue(userDoc());

      const before = Date.now();
      await service.forgotPassword({ email: 'guest@example.com' });
      const after = Date.now();

      const [, , expiresAt] = usersService.setResetToken.mock.calls[0];
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 30 * 60_000);
    });

    // A dead SMTP server must not change the response, or the difference
    // becomes the enumeration oracle the generic message exists to prevent.
    it('still answers normally when the mail server fails', async () => {
      usersService.findByEmail.mockResolvedValueOnce(userDoc());
      mailService.sendPasswordResetEmail.mockRejectedValue(
        new Error('SMTP unreachable'),
      );
      const failed = await service.forgotPassword({
        email: 'guest@example.com',
      });

      usersService.findByEmail.mockResolvedValueOnce(null);
      const unknown = await service.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(failed).toEqual(unknown);
    });
  });

  describe('resetPassword', () => {
    it('looks the user up by the digest of the submitted token', async () => {
      usersService.findByResetTokenHash.mockResolvedValue(userDoc());

      await service.resetPassword({
        token: 'raw-token',
        newPassword: NEW_PASSWORD,
      });

      expect(usersService.findByResetTokenHash).toHaveBeenCalledWith(
        hashResetToken('raw-token'),
      );
    });

    // Unknown, expired and already-spent tokens are deliberately the same
    // case: findByResetTokenHash returns nothing for all three.
    it('rejects a token that matches no live reset request', async () => {
      usersService.findByResetTokenHash.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'spent-or-forged',
          newPassword: NEW_PASSWORD,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('leaves the password alone when the token does not match', async () => {
      usersService.findByResetTokenHash.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'nope', newPassword: NEW_PASSWORD }),
      ).rejects.toThrow();

      expect(usersService.replacePassword).not.toHaveBeenCalled();
    });

    it('replaces the password when the token is live', async () => {
      const doc = userDoc();
      usersService.findByResetTokenHash.mockResolvedValue(doc);

      await service.resetPassword({
        token: 'raw-token',
        newPassword: NEW_PASSWORD,
      });

      expect(usersService.replacePassword).toHaveBeenCalledWith(
        doc,
        NEW_PASSWORD,
      );
    });

    // Signing the user in on reset would make a stolen link strictly more
    // valuable than it needs to be.
    it('does not hand back a session token', async () => {
      usersService.findByResetTokenHash.mockResolvedValue(userDoc());

      const result = await service.resetPassword({
        token: 'raw-token',
        newPassword: NEW_PASSWORD,
      });

      expect(result).not.toHaveProperty('accessToken');
    });
  });

  describe('changePassword', () => {
    it('replaces the password when the current one matches', async () => {
      const doc = { ...userDoc(), password: currentHash };
      usersService.findByIdWithPassword.mockResolvedValue(doc);

      await service.changePassword('user-1', {
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      expect(usersService.replacePassword).toHaveBeenCalledWith(
        doc,
        NEW_PASSWORD,
      );
    });

    // Without this check, a borrowed laptop with a live session is enough to
    // lock the real owner out.
    it('rejects a wrong current password', async () => {
      usersService.findByIdWithPassword.mockResolvedValue({
        ...userDoc(),
        password: currentHash,
      });

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'not-the-password',
          newPassword: NEW_PASSWORD,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(usersService.replacePassword).not.toHaveBeenCalled();
    });

    it('rejects a new password identical to the current one', async () => {
      usersService.findByIdWithPassword.mockResolvedValue({
        ...userDoc(),
        password: currentHash,
      });

      await expect(
        service.changePassword('user-1', {
          currentPassword: CURRENT_PASSWORD,
          newPassword: CURRENT_PASSWORD,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(usersService.replacePassword).not.toHaveBeenCalled();
    });

    // The token outlives the account it names, so the record can be gone.
    it('rejects when the account behind the token is gone', async () => {
      usersService.findByIdWithPassword.mockResolvedValue(null);

      await expect(
        service.changePassword('deleted-user', {
          currentPassword: CURRENT_PASSWORD,
          newPassword: NEW_PASSWORD,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
