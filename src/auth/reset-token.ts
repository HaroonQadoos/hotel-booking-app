// auth/reset-token.ts
import { createHash, randomBytes } from 'crypto';

const TOKEN_BYTES = 32;

// The raw token is what goes in the email; only its digest is ever stored, so
// a leaked database dump contains no usable reset links.
export function generateResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

// sha256 rather than bcrypt on purpose. The token already carries 256 bits of
// entropy, so it cannot be guessed and does not need a slow hash to protect it
// — and a fast, unsalted digest is what lets the reset lookup find the user in
// one indexed query. A bcrypt hash is salted per-row, so matching one would
// mean loading every user and comparing each in turn.
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
