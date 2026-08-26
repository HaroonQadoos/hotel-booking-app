import { generateResetToken, hashResetToken } from './reset-token';

describe('reset token', () => {
  describe('generateResetToken', () => {
    it('returns 32 bytes as a 64-character hex string', () => {
      expect(generateResetToken()).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns a different token on every call', () => {
      const tokens = new Set(
        Array.from({ length: 50 }, () => generateResetToken()),
      );

      expect(tokens.size).toBe(50);
    });
  });

  describe('hashResetToken', () => {
    it('returns the sha256 digest as a 64-character hex string', () => {
      expect(hashResetToken('some-raw-token')).toMatch(/^[0-9a-f]{64}$/);
    });

    // The digest is what lands in the database, so it must not be reversible
    // to the value that was emailed.
    it('never returns the raw token it was given', () => {
      const raw = generateResetToken();

      expect(hashResetToken(raw)).not.toBe(raw);
    });

    // Phase 2 looks the user up by re-hashing the submitted token, so the same
    // input has to produce the same digest every time or no reset would work.
    it('is deterministic for the same input', () => {
      const raw = generateResetToken();

      expect(hashResetToken(raw)).toBe(hashResetToken(raw));
    });

    it('produces different digests for different tokens', () => {
      expect(hashResetToken('token-a')).not.toBe(hashResetToken('token-b'));
    });
  });
});
