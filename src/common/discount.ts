// Sale pricing shared by rooms and venues. Pure functions on plain values so
// the response DTOs, the booking services and the specs all agree on the
// maths. A window's bounds are "YYYY-MM-DD" strings, both inclusive, and
// either may be null for an open end; string comparison orders them
// correctly because the format is fixed-width.

const MS_PER_DAY = 86_400_000;

export const MAX_DISCOUNT_PERCENT = 90;
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface DiscountWindow {
  discountPercent?: number | null;
  discountStartsAt?: string | null;
  discountEndsAt?: string | null;
}

// UTC calendar date of a timestamp — the same convention as stay dates.
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Money is held to 2 dp; rounding through whole cents keeps 0.1 + 0.2 noise
// out of stored totals.
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function isValidDiscountWindow(
  startsAt?: string | null,
  endsAt?: string | null,
): boolean {
  return !startsAt || !endsAt || endsAt >= startsAt;
}

export function isDiscountActiveOn(d: DiscountWindow, day: Date): boolean {
  // Documents written before discounts existed have no percent at all.
  if (!d.discountPercent || d.discountPercent <= 0) return false;
  const key = toDateKey(day);
  if (d.discountStartsAt && key < d.discountStartsAt) return false;
  if (d.discountEndsAt && key > d.discountEndsAt) return false;
  return true;
}

export function applyDiscount(price: number, percent: number): number {
  // In integer cents: 89 * 0.85 in floats is 75.6499…, not 75.65.
  const cents = Math.round(price * 100);
  return Math.round((cents * (100 - percent)) / 100) / 100;
}

// The unit price (per night, per hour) that applies on a given day.
export function priceOn(price: number, d: DiscountWindow, day: Date): number {
  return isDiscountActiveOn(d, day)
    ? applyDiscount(price, d.discountPercent!)
    : price;
}

// Each night is priced on its own date, so a stay that runs into or out of a
// sale is discounted only for the nights inside it.
export function priceNights(
  pricePerNight: number,
  d: DiscountWindow,
  checkIn: Date,
  nights: number,
): number {
  let cents = 0;
  for (let i = 0; i < nights; i++) {
    const night = new Date(checkIn.getTime() + i * MS_PER_DAY);
    cents += Math.round(priceOn(pricePerNight, d, night) * 100);
  }
  return cents / 100;
}
