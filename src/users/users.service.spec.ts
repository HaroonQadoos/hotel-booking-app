import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';

// A document as the service sees it: the fields it touches, plus save().
interface FakeUserDoc {
  password: string;
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
  save: jest.Mock<Promise<void>, []>;
}

function makeUserDoc(overrides: Partial<FakeUserDoc> = {}): FakeUserDoc {
  return {
    password: 'existing-hash',
    passwordResetTokenHash: undefined,
    passwordResetExpires: undefined,
    save: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    ...overrides,
  };
}

// The service takes a real Mongoose document; the stub above stands in for the
// handful of fields it actually touches.
const asUser = (doc: FakeUserDoc) => doc as unknown as User;

// Stands in for the Mongoose chain the service builds: findX(…).select(…).exec()
function makeQuery(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ exec });
  return { select, exec };
}

// The shape findByResetTokenHash builds, so the filter can be read back typed.
interface ResetFilter {
  passwordResetTokenHash: string;
  passwordResetExpires: { $gt: Date };
}

describe('UsersService', () => {
  let service: UsersService;
  let model: {
    findById: jest.Mock;
    findOne: jest.Mock<unknown, [ResetFilter]>;
    updateOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  beforeEach(async () => {
    model = {
      findById: jest.fn(),
      findOne: jest.fn<unknown, [ResetFilter]>(),
      updateOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: model },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findByIdWithPassword', () => {
    it('asks for the normally hidden password hash', async () => {
      const { select } = makeQuery(makeUserDoc());
      model.findById.mockReturnValue({ select });

      await service.findByIdWithPassword('user-1');

      expect(model.findById).toHaveBeenCalledWith('user-1');
      expect(select).toHaveBeenCalledWith('+password');
    });
  });

  describe('findByResetTokenHash', () => {
    it('looks the user up by the stored digest', async () => {
      const { select } = makeQuery(null);
      model.findOne.mockReturnValue({ select });

      await service.findByResetTokenHash('digest-abc');

      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ passwordResetTokenHash: 'digest-abc' }),
      );
    });

    // The expiry check lives in the query rather than in an `if` at the call
    // site, so there is no code path that can forget to make it.
    it('rejects expired tokens as part of the query', async () => {
      const { select } = makeQuery(null);
      model.findOne.mockReturnValue({ select });
      const before = Date.now();

      await service.findByResetTokenHash('digest-abc');

      const [filter] = model.findOne.mock.calls[0];
      expect(filter.passwordResetExpires.$gt).toBeInstanceOf(Date);
      expect(filter.passwordResetExpires.$gt.getTime()).toBeGreaterThanOrEqual(
        before,
      );
    });

    it('selects the hidden reset fields so they can be cleared afterwards', async () => {
      const { select } = makeQuery(null);
      model.findOne.mockReturnValue({ select });

      await service.findByResetTokenHash('digest-abc');

      expect(select).toHaveBeenCalledWith(
        expect.stringContaining('+passwordResetTokenHash'),
      );
    });
  });

  describe('setResetToken', () => {
    it('stores the digest and its expiry against the user', async () => {
      model.updateOne.mockResolvedValue({});
      const expires = new Date('2026-01-01T00:00:00.000Z');

      await service.setResetToken('user-1', 'digest-abc', expires);

      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        {
          passwordResetTokenHash: 'digest-abc',
          passwordResetExpires: expires,
        },
      );
    });
  });

  describe('replacePassword', () => {
    it('assigns the new plaintext and saves the document', async () => {
      const user = makeUserDoc();

      await service.replacePassword(asUser(user), 'brand-new-password');

      expect(user.password).toBe('brand-new-password');
      expect(user.save).toHaveBeenCalledTimes(1);
    });

    // The load-bearing test. findByIdAndUpdate / updateOne do not fire the
    // schema's pre('save') hook, so writing a password that way would store it
    // in plaintext — the exact bug CHANGES.md documents fixing.
    it('never writes the password through an update query', async () => {
      const user = makeUserDoc();

      await service.replacePassword(asUser(user), 'brand-new-password');

      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    // Clearing the digest is what makes a reset token single-use: once it is
    // gone, findByResetTokenHash can never match that token again.
    it('clears the reset token and expiry in the same save', async () => {
      const user = makeUserDoc({
        passwordResetTokenHash: 'digest-abc',
        passwordResetExpires: new Date(Date.now() + 60_000),
      });

      await service.replacePassword(asUser(user), 'brand-new-password');

      expect(user.passwordResetTokenHash).toBeUndefined();
      expect(user.passwordResetExpires).toBeUndefined();
      expect(user.save).toHaveBeenCalledTimes(1);
    });
  });
});
