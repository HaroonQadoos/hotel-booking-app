import * as bcrypt from 'bcrypt';
import { UserSchema, hashPasswordPreSave } from './user.schema';

// Minimal stand-in for a Mongoose document as seen by a `pre('save')` hook.
function makeDoc(password: string, modified: string[] = ['password']) {
  return {
    password,
    isModified(path: string) {
      return modified.includes(path);
    },
  };
}

describe('User schema password hashing', () => {
  it('registers a pre-save hook so no write path can store plaintext', () => {
    const registered = (UserSchema as any).s.hooks._pres.get('save') ?? [];
    const names = registered.map((h: any) => h.fn?.name);
    expect(names).toContain('hashPasswordPreSave');
  });

  it('replaces the plaintext password with a bcrypt hash', async () => {
    const doc = makeDoc('supersecret123');

    await hashPasswordPreSave.call(doc as any);

    expect(doc.password).not.toBe('supersecret123');
    expect(doc.password).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare('supersecret123', doc.password)).resolves.toBe(true);
  });

  it('does not re-hash when the password was not modified', async () => {
    const alreadyHashed = await bcrypt.hash('supersecret123', 10);
    const doc = makeDoc(alreadyHashed, []); // e.g. only `name` changed

    await hashPasswordPreSave.call(doc as any);

    expect(doc.password).toBe(alreadyHashed);
  });
});
