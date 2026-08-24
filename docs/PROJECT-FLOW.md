# hotel-booking-app — project flow & function reference

**Diagram:** [`project-flow.png`](./project-flow.png) — open it for the visual version.
Source for the diagram: [`project-flow.html`](./project-flow.html).

Stack: NestJS 11 · MongoDB Atlas via Mongoose 9 · Passport JWT · bcrypt.

---

## 1. Startup, step by step

| # | Step | Where |
|---|------|-------|
| 1 | `npm run start:dev` → `nest start --watch` | `package.json` |
| 2 | `ensureUsableDnsServers()` repairs the DNS resolver | `src/main.ts` |
| 3 | `NestFactory.create(AppModule)` builds the DI container | `src/main.ts` |
| 4 | `ConfigModule` loads `.env` globally | `src/app.module.ts` |
| 5 | `MongooseModule` connects using `MONGODB_URI` | `src/app.module.ts` |
| 6 | Feature modules register their controllers & providers | `Users`, `Booking`, `Auth` |
| 7 | Global `ValidationPipe` installed | `src/main.ts` |
| 8 | `app.listen(PORT)` — `PORT` comes from `.env` (3001) | `src/main.ts` |

If `AUTH_SECRET` or `MONGODB_URI` is missing, startup **fails here on purpose** —
`getOrThrow` refuses to boot rather than run with a broken config.

---

## 2. Request pipeline

Every request travels the same path. Order matters:

```
HTTP request
   ↓
global ValidationPipe        400 if the DTO fails
   ↓
JwtAuthGuard                 guarded routes only → 401
   ↓
Controller                   routing and response shaping only
   ↓
Service                      business rules
   ↓
Mongoose model → save()      pre('save') hashes the password on writes
   ↓
MongoDB Atlas
   ↓
UserResponseDto              strips the password out of the response
```

---

## 3. Route table

| Method | Path | Guard | Handler |
|--------|------|-------|---------|
| `GET` | `/` | — | `AppController.getHello` |
| `POST` | `/auth/register` | — | `AuthController.register` |
| `POST` | `/auth/login` | — | `AuthController.login` |
| `POST` | `/users` | — | `UsersController.create` |
| `GET` | `/users` | — | `UsersController.findAll` |
| `GET` | `/users/me` | **JwtAuthGuard** | `UsersController.getProfile` |
| `GET` | `/users/:id` | — | `UsersController.findOne` |
| `PATCH` | `/users/:id` | — | `UsersController.update` |
| `DELETE` | `/users/:id` | — | `UsersController.remove` |

> `/users/me` **must** stay declared above `/users/:id`. Nest matches routes in
> declaration order — a `:id` declared first would swallow `"me"` as an id.

---

## 4. Function-by-function

### `src/main.ts`

**`ensureUsableDnsServers()`**
On this machine Node's bundled c-ares resolver fails to read the Windows adapter
DNS config and falls back to `127.0.0.1`, where nothing is listening. That breaks
`dns.resolveSrv()`, which the driver needs for `mongodb+srv://` URIs. Only
overrides the servers when the resolver is actually in that broken state.

**`bootstrap()`**
Repairs DNS, creates the app, installs the global `ValidationPipe`
(`whitelist`, `forbidNonWhitelisted`, `transform`), then listens.
Without that pipe the `class-validator` decorators on every DTO are inert.

---

### `src/users/schemas/user.schema.ts`

**`User`** — the document: `name`, `email` (unique, lowercased), `password`
(`select: false`), `role` (`user` | `admin`), plus timestamps.

`select: false` means the hash is **excluded from every query** unless asked for
explicitly. It cannot leak through a response by accident.

**`hashPasswordPreSave()`** — the security-critical function
```ts
export async function hashPasswordPreSave(this: User): Promise<void> {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
}
UserSchema.pre('save', hashPasswordPreSave);
```
- Lives on the **document**, not a service, because `save()` is the one gate every
  write passes through. `create()`, `new User().save()`, a future seed script — all
  of them. A caller cannot forget to hash, because no caller decides.
- The `isModified` check stops a plain profile update from re-hashing an existing
  hash and locking the user out.
- **Takes no `next` callback.** Mongoose detects an async hook and awaits the
  returned promise instead of passing one; declaring `next` gets you `undefined`
  and a `TypeError` the moment you call it.

---

### `src/users/users.service.ts`

| Function | What it does |
|---|---|
| `create(dto)` | Rejects duplicate emails with 409, then `userModel.create(dto)` — which runs `save()`, which runs the hashing hook. |
| `findAll()` | All users. No password field (`select: false`). |
| `findByEmail(email)` | Lookup **without** the hash. Use this everywhere except login. |
| `findByEmailWithPassword(email)` | `.select('+password')` — the only function allowed to retrieve the hash. Login only; never return its result to a client. |
| `findOne(id)` | By id, throws `NotFoundException` (404) if absent. |
| `update(id, dto)` | `findByIdAndUpdate`. ⚠️ Query middleware — **does not** run `pre('save')`. Safe today only because `UpdateUserDto` omits `password`. |
| `remove(id)` | Deletes, 404 if absent. |

---

### `src/auth/auth.service.ts`

**`register(dto)`**
1. `findByEmail` → 409 `ConflictException` if taken.
2. `usersService.create(dto)` — **deliberately does not hash here.** The schema
   hook owns it. Two places hashing would double-hash and lock the user out forever.
3. `signToken(user)` — registering also logs you in.

**`login(dto)`**
1. `findByEmailWithPassword` → 401 if no such user.
2. `bcrypt.compare(submitted, stored)` → 401 if mismatch.
3. `signToken(user)`.

Both failures return the **identical** message — no account enumeration.

**`signToken(user)`** *(private)*
Builds the payload `{ sub: user._id, email, role }` and signs it. The payload is
base64, **not encrypted** — anyone holding the token can read it. Never put a
password in there.

---

### `src/auth/strategies/jwt.strategy.ts`

**`JwtStrategy.constructor`** — reads the bearer token from the `Authorization`
header, refuses expired tokens (`ignoreExpiration: false`), and verifies against
`AUTH_SECRET`.

**`validate(payload)`** — returns `{ userId: payload.sub, email, role }`, which
Passport assigns to `req.user`. Declaring the return type as `AuthUser` is what
keeps `@CurrentUser()` honest: change this shape and every consumer stops compiling.

---

### `src/auth/guards/jwt-auth.guard.ts`

**`JwtAuthGuard extends AuthGuard('jwt')`** — a named class instead of
`AuthGuard('jwt')` inline at every call site. The strategy name is spelled once,
and there's somewhere to hang custom error handling later.

### `src/auth/decorators/current-user.decorator.ts`

**`CurrentUser()`** — typed replacement for `@Req() req`. The handler receives
`AuthUser` instead of an untyped request, so a misspelled field is a compile
error rather than a runtime `undefined`. Only meaningful behind `JwtAuthGuard`.

---

### `src/users/users.controller.ts`

Thin — routing and shaping only. Every handler wraps its result in
`UserResponseDto`, which is what keeps the password out of responses.

**`getProfile(@CurrentUser() user)`** — the `/users/me` endpoint.
Re-reads the record from the database rather than returning `req.user` directly.
`req.user` is a snapshot from when the token was signed; with a 1-day expiry a
demoted admin would keep `role: 'admin'` for up to 24 hours, and a deleted account
would still return a profile.

---

### DTOs

| DTO | Role |
|---|---|
| `CreateUserDto` / `RegisterDto` | name 2–50, valid email, password ≥ 8 |
| `LoginDto` | email + password |
| `UpdateUserDto` | `PartialType(OmitType(CreateUserDto, ['password']))` — password deliberately not updatable here |
| `UserResponseDto` | The **only** shape returned to clients: `id`, `name`, `email`, `role`, `createdAt` |

---

## 5. Known gaps

| Area | Status |
|---|---|
| Legacy rows | Users created before the fix are **still plaintext**. The hook only fires on new saves. Hash them in place or drop the collection. |
| Guards | Only `/users/me` is protected. `/users`, `/users/:id`, `PATCH`, `DELETE` are all open. |
| `BookingModule` | Empty stub — no routes, no schema, no service methods. |
| Change password | Must load the document and call `.save()`. `findByIdAndUpdate` bypasses the hashing hook. |
| `POST /users` | Open, unauthenticated, duplicates `/auth/register`. Consider making it admin-only. |
| Tests | 5 suites fail — all pre-existing Nest scaffolding, unrelated to this work. |
