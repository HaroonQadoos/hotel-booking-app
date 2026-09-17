import { BadRequestException } from '@nestjs/common';

// Hotel nights are whole days, so every date here is a UTC midnight and
// arithmetic is done in whole days. Time zones are deliberately out of scope:
// one hotel, one calendar.

const MS_PER_DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Longest single stay accepted. Keeps a typo like 2026 → 2062 from holding a
// room for decades; a genuine long stay can be booked in parts.
export const MAX_STAY_NIGHTS = 30;

// "2026-10-03" → 2026-10-03T00:00:00Z. Anything else (a timestamp, a
// slash-separated date, 31 February) is rejected rather than coerced.
export function parseStayDate(value: string, field: string): Date {
  if (!DATE_ONLY.test(value)) {
    throw new BadRequestException(`${field} must be a date in YYYY-MM-DD form`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  // Date.parse rounds "2026-02-31" forward to March 3rd; comparing the
  // round-trip is what catches it.
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} is not a real calendar date`);
  }
  return date;
}

export function todayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY);
}

export interface Stay {
  checkIn: Date;
  checkOut: Date;
  nights: number;
}

// The single place a requested stay is validated, shared by booking creation
// and the availability search so the two can never disagree on what a legal
// stay is.
export function parseStay(
  checkInRaw: string,
  checkOutRaw: string,
  now: Date = new Date(),
): Stay {
  const checkIn = parseStayDate(checkInRaw, 'checkIn');
  const checkOut = parseStayDate(checkOutRaw, 'checkOut');

  if (checkIn < todayUtc(now)) {
    throw new BadRequestException('checkIn cannot be in the past');
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) {
    throw new BadRequestException('checkOut must be after checkIn');
  }
  if (nights > MAX_STAY_NIGHTS) {
    throw new BadRequestException(
      `Stays are limited to ${MAX_STAY_NIGHTS} nights`,
    );
  }
  return { checkIn, checkOut, nights };
}
