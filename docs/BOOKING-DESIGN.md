# Booking domain — design

Status: **proposed**, not yet implemented. `BookingModule` is currently a 4-line stub.

**Diagrams:** [`booking-flow.png`](./booking-flow.png) — seven steps, each with the flow
and what it does. Source: [`booking-flow.html`](./booking-flow.html).

Decisions taken up front:

| Decision | Choice |
|---|---|
| Inventory model | **Room types with allotment** — you sell "a Deluxe Double", not room 237 |
| Property scope | **Multi-hotel** — a `Hotel` entity owns room types |
| Payments | **Out of scope** — `paymentStatus` field only, no gateway |

---

## 1. Entities

```
Hotel  ──1:N──>  RoomType  ──1:N──>  Booking  <──N:1──  User
```

### Hotel

| Field | Type | Notes |
|---|---|---|
| `name` | string | required |
| `description` | string | |
| `address` | `{ line1, line2?, city, state?, country, postalCode }` | `city` + `country` indexed for search |
| `timezone` | string | IANA name, e.g. `Europe/London`. Load-bearing — see §3 |
| `checkInTime` / `checkOutTime` | string | `"15:00"` / `"11:00"`, display only in phase 1 |
| `amenities` | string[] | |
| `images` | string[] | URLs |
| `isActive` | boolean | default `true` |

### RoomType

| Field | Type | Notes |
|---|---|---|
| `hotel` | ObjectId → Hotel | indexed |
| `name` | string | `"Deluxe Double"` |
| `description` | string | |
| `basePricePerNight` | **integer** | minor units (cents/paisa). See §5 |
| `currency` | string | ISO 4217, `"USD"` |
| `maxOccupancy` | number | guests **per unit** |
| `totalUnits` | number | the allotment — how many of this type the hotel has |
| `amenities`, `images` | string[] | |
| `isActive` | boolean | default `true` |

### Booking

| Field | Type | Notes |
|---|---|---|
| `reference` | string | unique, human-quotable, e.g. `HB-7K2M9Q` |
| `user` | ObjectId → User | indexed |
| `hotel` | ObjectId → Hotel | denormalised from roomType — lets "bookings at this hotel" skip a join |
| `roomType` | ObjectId → RoomType | indexed |
| `checkIn` / `checkOut` | Date | UTC midnight, **half-open** `[checkIn, checkOut)`. See §3 |
| `unitsBooked` | number | default 1 |
| `guests` | `{ adults, children }` | |
| `pricing` | `{ pricePerNight, currency, nights, unitsBooked, totalPrice }` | **snapshot**. See §5 |
| `status` | enum | `pending` \| `confirmed` \| `cancelled` \| `completed` \| `no_show` |
| `paymentStatus` | enum | `unpaid` \| `paid` \| `refunded` |
| `guestNotes` | string | |
| `cancelledAt`, `cancelledBy`, `cancellationReason` | | audit trail |

`pending` exists in the enum but is **unused in phase 1** — with no payment step to wait
for, bookings are created `confirmed`. It is there so adding Stripe later does not mean
migrating the enum. This also sidesteps hold-expiry: there are no abandoned `pending`
bookings silently eating inventory.

---

## 2. Availability — the part that is easy to get wrong

### The naive version is wrong

The obvious formula is "subtract the overlapping bookings from the allotment":

```
available = totalUnits - SUM(unitsBooked of overlapping bookings)   // WRONG
```

It over-rejects. Counter-example — a room type with `totalUnits: 2`:

```
booking A: Jun 1 → Jun 2, 1 unit
booking B: Jun 3 → Jun 4, 1 unit
request:   Jun 1 → Jun 4, 1 unit
```

Both bookings overlap the request, so the sum is 2, and `2 - 2 = 0` → **rejected**.
But look at it night by night:

```
night      Jun 1   Jun 2   Jun 3
occupied     1       0       1
free         1       2       1     ← at least one unit free every night
```

The request should be **accepted**. Occupancy is not additive across a range; it is a
per-night quantity, and what constrains a stay is its **worst** night.

### The correct version

```
available(roomType, checkIn, checkOut) =
    totalUnits - MAX over each night n in [checkIn, checkOut) of occupied(n)
```

Computed with a sweep line over the overlapping bookings, which avoids materialising
one entry per night:

1. Fetch bookings for this room type where `status IN (pending, confirmed)` and the
   range overlaps (predicate below).
2. Emit two events per booking: `+unitsBooked` at `checkIn`, `-unitsBooked` at `checkOut`,
   each clamped into the requested window.
3. Sort by date. **At an equal date, process departures (`-`) before arrivals (`+`).**
4. Walk the events keeping a running total; the peak of that total is `MAX occupied`.

Step 3 is not cosmetic. With `totalUnits: 1`, booking A `Jun 1 → Jun 3` and booking B
`Jun 3 → Jun 5`, processing the arrival first makes the running total momentarily hit 2
and reports negative availability for a perfectly legal back-to-back pair.

This lives in **`src/booking/availability.ts` as a pure function** — no Mongoose, no
injection — so it unit-tests exhaustively against hand-built arrays. Same shape as the
existing `src/auth/reset-token.ts` + its spec.

### The overlap predicate

Two half-open ranges overlap iff:

```
a.checkIn < b.checkOut  AND  b.checkIn < a.checkOut
```

**Strict on both sides.** That is exactly what makes back-to-back bookings legal: a stay
ending Jun 3 vacates on the morning of Jun 3, so a stay starting Jun 3 does not conflict.
A `<=` on either side here is the single most likely bug in this module — it produces
phantom conflicts that are maddening to reproduce because they only appear on
touching dates.

---

## 3. Date handling

Hotel nights are **date-only**, not instants. `Jun 1 → Jun 3` is two nights (Jun 1 and
Jun 2) regardless of what clock anyone is looking at.

- DTOs accept `YYYY-MM-DD` strings, validated with `@IsDateString()`.
- The service normalises each to **UTC midnight** before it touches the database.
  Without this, a client in UTC+5 sending a local-midnight timestamp stores the
  *previous* day, and stays silently shift by one night.
- `nights = (checkOut - checkIn) / 86_400_000` — exact, because both ends are UTC
  midnight and UTC has no DST.

`Hotel.timezone` is stored now and used for one thing in phase 1: deciding what "today"
means when rejecting past-dated bookings. A guest in Auckland must be able to book a
room in Los Angeles for "today" while it is still yesterday there.

### Booking validation rules

| Rule | Reason |
|---|---|
| `checkIn < checkOut` | a zero-night stay is not a stay |
| `checkIn >= today` in the hotel's timezone | no booking the past |
| `nights <= MAX_STAY` (30) | bounds the sweep and blocks a request spanning years |
| `checkIn <= today + MAX_ADVANCE` (365d) | prices and allotments are not meaningful that far out |
| `adults + children <= maxOccupancy * unitsBooked` | fire code, and stops 8 people booking one single |
| `unitsBooked >= 1`, `<= MAX_UNITS_PER_BOOKING` (5) | a group booking is a different product |
| room type and its hotel are both `isActive` | delisted inventory must not be bookable |

---

## 4. Overbooking — the concurrency problem

Checking availability and then inserting a booking is check-then-act. Two requests can
both read "1 unit free" and both insert. The room is sold twice.

**A transaction alone does not fix this.** MongoDB gives snapshot isolation, and two
inserts of two *different* booking documents never conflict with each other — both
commit happily. There is no shared document for them to fight over, and range overlap
cannot be expressed as a unique index.

### Phase 1: serialise on the RoomType document

Inside a transaction, bump a counter on the `RoomType` before inserting:

```
withTransaction:
  1. RoomType.updateOne({ _id }, { $inc: { bookingSeq: 1 } })   ← forces the conflict
  2. recompute availability from bookings (§2), inside the same txn
  3. reject if insufficient
  4. insert the Booking
```

Step 1 makes concurrent bookings of the *same room type* write the same document, so
the second one takes a write conflict and retries — at which point step 2 sees the
first booking and correctly refuses. Bookings of *different* room types stay fully
parallel. For an app of this size that is ample throughput, and it keeps `bookings`
as the single source of truth with no derived state to drift.

> **Requires a replica set.** Atlas is one, so this works in deployment. A standalone
> local `mongod` throws on `startSession().withTransaction()` — either run a
> single-node replica set locally (`mongod --replSet rs0` + `rs.initiate()`) or point
> dev at Atlas. This should be called out in the README, because the failure mode is
> an unhelpful error at booking time rather than at boot.

### The scale-up path, when it is needed

Replace the computed availability with **per-night inventory documents** —
one `{ roomType, date, unitsBooked }` per night — and book with a guarded atomic
update per night inside a transaction:

```
updateOne({ roomType, date, unitsBooked: { $lte: totalUnits - n } },
          { $inc: { unitsBooked: n } })
```

Zero matched documents means no availability. This is what production revenue systems
do, and it drops per-date pricing and stop-sell in your lap for free. It is deliberately
**not** phase 1: it adds derived state that can drift from `bookings`, and it is only
worth that cost under contention this app will not see for a long time.

The service interface (`checkAvailability`, `reserve`) is designed so this swap touches
one file.

---

## 5. Pricing

- **Integers, minor units.** `basePricePerNight: 14999` is $149.99. Floats accumulate
  error across a multiply-and-sum, and `0.1 + 0.2` problems in an invoice are the kind
  of bug that gets noticed by customers rather than tests.
- **Server-side only.** `totalPrice = pricePerNight * nights * unitsBooked`, computed
  from the `RoomType` record. A price in the request body is ignored — the global
  `ValidationPipe` already runs `forbidNonWhitelisted`, so sending one is a 400.
- **Snapshotted onto the booking.** `Booking.pricing` copies the rate, currency and
  night count at the moment of booking. When an admin raises the room rate next week,
  existing bookings must not silently re-price; and a guest asking "why was I charged
  this" needs the answer stored, not recomputed.

---

## 6. Routes

### Hotels

| Method | Path | Guard |
|---|---|---|
| `POST` | `/hotels` | JwtAuthGuard + RolesGuard(`admin`) |
| `GET` | `/hotels` | public — `?city=&q=&page=&limit=` |
| `GET` | `/hotels/:id` | public |
| `PATCH` | `/hotels/:id` | admin |
| `DELETE` | `/hotels/:id` | admin — **soft delete** (`isActive: false`) |

### Room types

| Method | Path | Guard |
|---|---|---|
| `POST` | `/hotels/:hotelId/room-types` | admin |
| `GET` | `/hotels/:hotelId/room-types` | public |
| `GET` | `/room-types/:id` | public |
| `PATCH` | `/room-types/:id` | admin |
| `DELETE` | `/room-types/:id` | admin — soft delete |

Deletes are soft because bookings reference these records. A hard delete would leave a
guest holding a confirmed reservation pointing at nothing.

### Availability

| Method | Path | Guard |
|---|---|---|
| `GET` | `/hotels/:hotelId/availability?checkIn=&checkOut=&guests=` | public |
| `GET` | `/room-types/:id/availability?checkIn=&checkOut=` | public |

Returns `availableUnits` and the computed `totalPrice` per room type. Public on purpose —
a guest has to be able to shop before they have an account.

### Bookings

| Method | Path | Guard |
|---|---|---|
| `POST` | `/bookings` | JwtAuthGuard + **EmailVerifiedGuard** |
| `GET` | `/bookings/me` | JwtAuthGuard |
| `GET` | `/bookings` | admin — `?status=&hotel=&from=&to=` |
| `GET` | `/bookings/:id` | JwtAuthGuard + owner-or-admin |
| `PATCH` | `/bookings/:id/cancel` | JwtAuthGuard + owner-or-admin |
| `PATCH` | `/bookings/:id/status` | admin — `completed` / `no_show` |

> `/bookings/me` **must** be declared above `/bookings/:id` — the same route-ordering
> trap already documented on `/users/me`. Nest matches in declaration order, so a `:id`
> declared first swallows `"me"` and tries to load it as an ObjectId.

### Cancellation

A guest may cancel while `status === 'confirmed'` and `checkIn` is still in the future.
Admins may cancel at any point. Cancelling sets `status: 'cancelled'` and stamps the
audit fields — it never deletes the row, because the booking is a financial record and
because §2 filters cancelled bookings out of occupancy anyway, so the inventory returns
on its own.

---

## 7. Two changes outside the booking module

**1. `assertCanActOn` gets promoted.** It currently lives as a private method on
`UsersController`. Bookings need the byte-identical rule (admin, or your own record),
and a copy-paste of an authorization check is how the two copies drift. Extract to
`src/auth/ownership.ts` as a pure function and call it from both.

**2. `isEmailVerified` finally gets enforced.** It is set today and checked nowhere —
a live gap. `POST /bookings` is the natural place: an unverified address means the
confirmation email bounces into nothing, and a reservation nobody can prove they hold
is worse than a rejected request. Add `src/auth/guards/email-verified.guard.ts`, which
reads the record back (not the token — `AuthUser` has no such claim, and a token signed
before verification would be stale for up to 24h).

---

## 8. Indexes

| Collection | Index | Serves |
|---|---|---|
| `bookings` | `{ roomType: 1, status: 1, checkIn: 1 }` | the availability sweep — the hot path |
| `bookings` | `{ user: 1, createdAt: -1 }` | `GET /bookings/me` |
| `bookings` | `{ reference: 1 }` unique | guest lookup by code |
| `bookings` | `{ hotel: 1, checkIn: 1 }` | admin arrivals list |
| `roomtypes` | `{ hotel: 1, isActive: 1 }` | room types of a hotel |
| `hotels` | `{ 'address.city': 1, isActive: 1 }` | city search |
| `hotels` | text on `name`, `description` | `?q=` search |

---

## 9. Emails

Two additions to `MailService`, following the existing `sendVerificationEmail` pattern:

- `sendBookingConfirmation(to, booking)` — reference, hotel, dates, total
- `sendBookingCancellation(to, booking)`

Both fire-and-forget with a logged failure, exactly as `AuthService.register()` does it:
a flaky SMTP server must never fail a booking that is already committed to the database.

> `MailService` still provisions a throwaway Ethereal account on every boot. That is
> fine for dev and wrong for anything real — worth swapping for configured SMTP before
> these emails matter.

---

## 10. File layout

```
src/hotels/
  hotels.module.ts
  hotels.controller.ts          hotels.controller.spec.ts
  hotels.service.ts             hotels.service.spec.ts
  schemas/hotel.schema.ts
  dto/{create-hotel,update-hotel,query-hotels,hotel-response}.dto.ts

src/room-types/
  room-types.module.ts
  room-types.controller.ts      room-types.controller.spec.ts
  room-types.service.ts         room-types.service.spec.ts
  schemas/room-type.schema.ts
  dto/{create-room-type,update-room-type,room-type-response}.dto.ts

src/booking/
  booking.module.ts
  booking.controller.ts         booking.controller.spec.ts
  booking.service.ts            booking.service.spec.ts
  availability.ts               availability.spec.ts      ← pure, no Mongo
  dates.ts                      dates.spec.ts             ← pure, no Mongo
  reference.ts                  reference.spec.ts         ← pure, no Mongo
  schemas/booking.schema.ts
  dto/{create-booking,cancel-booking,query-bookings,availability-query,booking-response}.dto.ts

src/auth/
  ownership.ts                  ownership.spec.ts         ← extracted from UsersController
  guards/email-verified.guard.ts
```

The three pure modules in `src/booking/` hold every rule that is easy to get wrong —
overlap, the sweep, UTC normalisation, night counting — deliberately separated from
anything that needs a database so they can be tested exhaustively and cheaply.

---

## 11. Build order

| Phase | Contents | Why here |
|---|---|---|
| 1 | `Hotel` + `RoomType` schemas, CRUD, public reads | nothing else can be built without inventory to book |
| 2 | `dates.ts`, `availability.ts` + exhaustive specs | the hard logic, proven before any database is involved |
| 3 | `Booking` schema, create with transaction, cancel | the core feature |
| 4 | `EmailVerifiedGuard`, `ownership.ts` extraction, booking emails | rounds out the flow |
| 5 | e2e: double-booking race, back-to-back dates, cancel-returns-inventory | the regressions that matter |

Phase 2 before phase 3 is the point of the whole layout: the availability rules get
settled as pure functions with real tests before they are entangled with Mongoose
sessions and transactions.
