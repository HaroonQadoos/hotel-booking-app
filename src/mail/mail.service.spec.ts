import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

// nodemailer's exports are not configurable, so jest.spyOn cannot patch them;
// the whole module is replaced instead. Everything else in the real module is
// kept so getTestMessageUrl() still behaves.
jest.mock('nodemailer', () => {
  const actual = jest.requireActual<typeof nodemailer>('nodemailer');
  return {
    ...actual,
    createTransport: jest.fn(),
    createTestAccount: jest.fn(),
  };
});

// The subset of nodemailer's message options this service actually sets.
interface SentMail {
  from: string;
  to: string;
  subject: string;
  html: string;
}

describe('MailService', () => {
  let service: MailService;
  let sendMail: jest.Mock<Promise<{ messageId: string }>, [SentMail]>;
  let config: { get: jest.Mock<string | undefined, [string, string?]> };

  beforeEach(async () => {
    config = { get: jest.fn<string | undefined, [string, string?]>() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get<MailService>(MailService);

    // onModuleInit() would reach out to Ethereal for a real SMTP account, so
    // the transport is swapped in directly instead of being created.
    sendMail = jest
      .fn<Promise<{ messageId: string }>, [SentMail]>()
      .mockResolvedValue({ messageId: 'test-message-id' });
    (
      service as unknown as { transporter: { sendMail: typeof sendMail } }
    ).transporter = { sendMail };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendPasswordResetEmail', () => {
    it('sends to the address that asked for the reset', async () => {
      config.get.mockReturnValue('https://app.example.com');

      await service.sendPasswordResetEmail('guest@example.com', 'raw-token');

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].to).toBe('guest@example.com');
    });

    // The link has to point at the frontend form, not at this API — the API
    // never renders a page, and a token in a URL this server handles would
    // land in its access logs.
    it('builds the link from FRONTEND_URL', async () => {
      config.get.mockReturnValue('https://app.example.com');

      await service.sendPasswordResetEmail('guest@example.com', 'raw-token');

      expect(config.get).toHaveBeenCalledWith(
        'FRONTEND_URL',
        expect.any(String),
      );
      expect(sendMail.mock.calls[0][0].html).toContain(
        'https://app.example.com/reset-password?token=raw-token',
      );
    });

    // 5173 is the Vite dev server, where the reset form lives. 3000 would be
    // this API, which has no page to land on.
    it('falls back to the local Vite dev server when FRONTEND_URL is unset', async () => {
      config.get.mockImplementation(
        (_key: string, fallback?: string) => fallback,
      );

      await service.sendPasswordResetEmail('guest@example.com', 'raw-token');

      expect(sendMail.mock.calls[0][0].html).toContain(
        'http://localhost:5173/reset-password?token=raw-token',
      );
    });

    // Hex tokens need no escaping, but the encoding is what keeps the link
    // correct if the token format ever changes to something base64-shaped.
    it('url-encodes the token', async () => {
      config.get.mockReturnValue('https://app.example.com');

      await service.sendPasswordResetEmail('guest@example.com', 'a+b/c=d');

      expect(sendMail.mock.calls[0][0].html).toContain('token=a%2Bb%2Fc%3Dd');
    });
  });

  describe('onModuleInit transport selection', () => {
    const createTransport = nodemailer.createTransport as jest.MockedFunction<
      typeof nodemailer.createTransport
    >;
    const createTestAccount =
      nodemailer.createTestAccount as jest.MockedFunction<
        typeof nodemailer.createTestAccount
      >;
    let verify: jest.Mock<Promise<true>, []>;

    // Neither path may touch the network in a unit test: the SMTP branch is
    // asserted through the options handed to createTransport, the Ethereal
    // branch through whether createTestAccount was consulted at all.
    beforeEach(() => {
      createTransport.mockReset();
      createTestAccount.mockReset();
      verify = jest.fn<Promise<true>, []>().mockResolvedValue(true);
      createTransport.mockReturnValue({
        verify,
        sendMail,
      } as unknown as ReturnType<typeof nodemailer.createTransport>);
      createTestAccount.mockResolvedValue({
        user: 'ethereal-user',
        pass: 'ethereal-pass',
        smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
      } as nodemailer.TestAccount);
    });

    function env(values: Record<string, string>) {
      config.get.mockImplementation(
        (key: string, fallback?: string) => values[key] ?? fallback,
      );
    }

    it('uses a real SMTP server when MAIL_HOST is set', async () => {
      env({
        MAIL_HOST: 'smtp.example.com',
        MAIL_PORT: '587',
        MAIL_USER: 'mailer',
        MAIL_PASS: 'hunter2',
      });

      await service.onModuleInit();

      expect(createTestAccount).not.toHaveBeenCalled();
      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'mailer', pass: 'hunter2' },
      });
      expect(verify).toHaveBeenCalledTimes(1);
    });

    it('infers implicit TLS from port 465', async () => {
      env({ MAIL_HOST: 'smtp.example.com', MAIL_PORT: '465' });

      await service.onModuleInit();

      expect(createTransport.mock.calls[0][0]).toMatchObject({
        port: 465,
        secure: true,
      });
    });

    it('omits auth when no credentials are configured', async () => {
      env({ MAIL_HOST: 'localhost', MAIL_PORT: '1025' });

      await service.onModuleInit();

      expect(createTransport.mock.calls[0][0]).toMatchObject({
        auth: undefined,
      });
    });

    // A mail outage must not take the API down with it — the send path
    // already tolerates failures per message.
    it('still boots when the SMTP server refuses to verify', async () => {
      env({ MAIL_HOST: 'smtp.example.com' });
      verify.mockRejectedValue(new Error('535 bad credentials'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('falls back to an Ethereal inbox when MAIL_HOST is unset', async () => {
      env({});

      await service.onModuleInit();

      expect(createTestAccount).toHaveBeenCalledTimes(1);
      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
      });
    });

    it('sends from MAIL_FROM when it is set', async () => {
      env({ MAIL_FROM: '"Hotel Booking" <hello@example.com>' });

      await service.onModuleInit();
      await service.sendPasswordResetEmail('guest@example.com', 'raw-token');

      expect(sendMail.mock.calls[0][0].from).toBe(
        '"Hotel Booking" <hello@example.com>',
      );
    });
  });
});
