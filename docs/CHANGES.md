# Change log — 2026-08-21

Everything changed in this session, why, and how it was verified.
Companion doc: [`PROJECT-FLOW.md`](./PROJECT-FLOW.md).

Two pieces of work:
1. **Passwords were stored in plaintext.** Fixed at the schema level.
2. **`/users/me` didn't compile.** Built the missing guard and typed the flow.

---

## Part 1 — plaintext passwords

### Root cause

Three gaps lined up:

1. **The live path never hashed.** `UsersService.create()` did
   `this.userModel.create(dto)` — `dto.password` is the raw string off the HTTP
   body. `users.service.ts` imported `bcrypt` on line 4 and never called it.
2. **The code that did hash was unreachable.** `AuthService.register()` called
   `bcrypt.hash` correctly, but `AuthController` was an empty class with no
   routes and `AuthModule` declared no controllers. `POST /auth/register` was a
   404 — dead code from the first commit.
3. **No safety net.** `UserSchema` had no `pre('save')` hook.

### Fix

Hashing moved onto the document, in the `pre('save')` hook — the one gate every
write passes through.

### Files

| File | Change |
|---|---|
| `src/users/schemas/user.schema.ts` | Added `hashPasswordPreSave` + `UserSchema.pre('save', …)`. Marked `password` as `select: false`. |
| `src/users/users.service.ts` | Removed the unused `bcrypt` import. Added `findByEmailWithPassword()`. |
| `src/auth/auth.service.ts` | **Stopped** hashing (schema owns it — two places would double-hash). `login()` uses the `+password` query. |
| `src/auth/auth.controller.ts` | Was an empty class. Added `POST /auth/register` and `POST /auth/login`. |
| `src/auth/auth.module.ts` | Registered `AuthController` and `JwtStrategy` — neither was wired in. |
| `src/main.ts` | Added the global `ValidationPipe`. |
| `src/users/schemas/user.schema.spec.ts` | New — 3 tests. |

### Two bugs found while verifying

**a) Secret name mismatch.** The code read `JWT_SECRET`; `.env` defines
`AUTH_SECRET`. Worse, the two sides disagreed with each other:

```ts
// auth.module.ts   — signed with the literal string 'yourSecretKey'
secret: process.env.JWT_SECRET || 'yourSecretKey'
// jwt.strategy.ts  — verified with undefined
secretOrKey: configService.get<string>('JWT_SECRET')!
```

Every valid token would have been rejected with no error explaining why. The `!`
asserted to the compiler that a genuinely missing value was present.
Both now use `getOrThrow<string>('AUTH_SECRET')`. `.env` was left untouched.

**b) My own hook was wrong on the first attempt.** I wrote it taking a `next`
callback:

```ts
// BROKEN — TypeError: next is not a function
export async function hashPasswordPreSave(this: User, next: Callback) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
}
```

Mongoose (via Kareem) detects an `AsyncFunction` and **awaits the promise instead
of passing `next`**, so `next` was `undefined`. `POST /auth/register` returned
500. The unit test passed against this broken code because it supplied a `next`
by hand — a calling convention Mongoose never uses. Both the hook and the test
were corrected; the test now fails against the old version.

### Verified

```
POST /auth/register              HTTP 201  + accessToken
POST /auth/login   correct pw    HTTP 200  + accessToken
POST /auth/login   wrong pw      HTTP 401  Invalid credentials

# read straight out of the users collection
stored password : "$2b$10$6Zit6lMRSo3bG3zfEhkyKew.7flDHXOOYKc8X1YQvuY4bSF6CgRle"
is bcrypt hash  : true
is plaintext    : false
```

---

## Part 2 — `/users/me`

### What was wrong

- **It didn't compile.** `JwtAuthGuard` didn't exist anywhere —
  `TS2304: Cannot find name 'JwtAuthGuard'`. No `src/auth/guards/` directory.
- **`@Req() req` was untyped.** `noImplicitAny: false` made it `any`, so
  `req.usr.role` would have compiled and failed at runtime.
- **It returned the token payload, not the user.** Stale by up to 24 hours, and a
  different shape from every other route in the controller.
- Route order was already correct (`me` above `:id`) — documented with a comment
  since it's load-bearing and easy to break.

### Files added

| File | Purpose |
|---|---|
| `src/auth/guards/jwt-auth.guard.ts` | The missing `JwtAuthGuard` |
| `src/auth/types/auth-user.ts` | `AuthUser` + `JwtPayload` interfaces |
| `src/auth/decorators/current-user.decorator.ts` | `@CurrentUser()` |

### Files changed

| File | Change |
|---|---|
| `src/users/users.controller.ts` | Rewrote `getProfile` — typed param, re-reads the record, returns `UserResponseDto`. Dropped the now-unused `Req` import. |
| `src/auth/strategies/jwt.strategy.ts` | `validate(payload: JwtPayload): AuthUser`. Dropped `async` (nothing awaited). Uses `AUTH_SECRET`. |

**Gotcha worth remembering:** `import type { AuthUser }` in the controller is
required, not stylistic. With `isolatedModules` + `emitDecoratorMetadata`, a
value import of a type used in a decorated signature is `TS1272`.

### Verified

```
route order   /users/me mapped before /users/:id   ✓
no token                                  HTTP 401
garbage token                             HTTP 401
token forged with old 'yourSecretKey'     HTTP 401
valid token                               HTTP 200
```

The 200 returned `{id, name, email, role, createdAt}` — no password field.

---

## Docs added

| File | What |
|---|---|
| `docs/project-flow.png` | Whole-project diagram — **open this one** |
| `docs/project-flow.html` | Source for the diagram |
| `docs/PROJECT-FLOW.md` | Function-by-function reference |
| `docs/auth-flow-diagram.png` | Register → login → protected route |
| `docs/auth-flow-diagram.html` | Source for that diagram |
| `docs/auth-flow.html` | Narrative auth write-up |
| `docs/CHANGES.md` | This file |

---

## Final state

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` on changed files | clean |
| `user.schema.spec.ts` | 3/3 pass |
| App boots, all 9 routes mapped | yes |
| Other 5 test suites | fail — pre-existing, untouched |

The 5 failures: `app.controller.spec` expects `"Hello World!"` while `AppService`
returns `"Hello Haroon!"`; the other four are Nest scaffolding specs that
instantiate services with none of their dependencies provided.

---

## Not done — your call

1. **Legacy plaintext rows.** The hook only fires on new saves. Existing rows are
   still plaintext and should be treated as compromised.
2. **Guards.** Only `/users/me` is protected. Everything else is open.
3. **`POST /users`.** Open, unauthenticated, near-duplicate of `/auth/register`.
4. **`BookingModule`.** Still an empty stub.
