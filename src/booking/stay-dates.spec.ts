import { BadRequestException } from '@nestjs/common';
import {
  MAX_STAY_NIGHTS,
  nightsBetween,
  parseStay,
  parseStayDate,
  todayUtc,
} from './stay-dates';

// A fixed "now" so the past/future rules are deterministic. Late in the day
// UTC on purpose: local-time arithmetic would put "today" on the wrong side.
const NOW = new Date('2026-09-18T23:30:00Z');

describe('parseStayDate', () => {
  it('parses a date-only string to UTC midnight', () => {
    expect(parseStayDate('2026-10-03', 'checkIn').toISOString()).toBe(
      '2026-10-03T00:00:00.000Z',
    );
  });

  it.each([
    ['2026-10-03T10:00:00Z', 'a timestamp'],
    ['03/10/2026', 'a slash date'],
    ['2026-1-3', 'unpadded parts'],
    ['', 'empty'],
  ])('rejects %s (%s)', (value) => {
    expect(() => parseStayDate(value, 'checkIn')).toThrow(BadRequestException);
  });

  // Date.parse would silently roll these forward into the next month.
  it.each(['2026-02-31', '2026-04-31', '2026-13-01'])(
    'rejects the impossible date %s',
    (value) => {
      expect(() => parseStayDate(value, 'checkIn')).toThrow(
        'not a real calendar date',
      );
    },
  );

  it('names the field in the error', () => {
    expect(() => parseStayDate('nope', 'checkOut')).toThrow(/^checkOut /);
  });
});

describe('todayUtc', () => {
  it('drops the time of day', () => {
    expect(todayUtc(NOW).toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });
});

describe('nightsBetween', () => {
  it('counts whole nights', () => {
    expect(
      nightsBetween(
        new Date('2026-10-03T00:00:00Z'),
        new Date('2026-10-06T00:00:00Z'),
      ),
    ).toBe(3);
  });
});

describe('parseStay', () => {
  it('returns both dates and the night count', () => {
    expect(parseStay('2026-10-03', '2026-10-06', NOW)).toEqual({
      checkIn: new Date('2026-10-03T00:00:00Z'),
      checkOut: new Date('2026-10-06T00:00:00Z'),
      nights: 3,
    });
  });

  it('allows checking in today', () => {
    expect(parseStay('2026-09-18', '2026-09-19', NOW).nights).toBe(1);
  });

  it('rejects a check-in before today', () => {
    expect(() => parseStay('2026-09-17', '2026-09-19', NOW)).toThrow(
      'checkIn cannot be in the past',
    );
  });

  it.each([
    ['2026-10-03', '2026-10-03', 'same day'],
    ['2026-10-03', '2026-10-02', 'reversed'],
  ])('rejects %s → %s (%s)', (checkIn, checkOut) => {
    expect(() => parseStay(checkIn, checkOut, NOW)).toThrow(
      'checkOut must be after checkIn',
    );
  });

  it(`allows exactly ${MAX_STAY_NIGHTS} nights but not one more`, () => {
    expect(parseStay('2026-10-01', '2026-10-31', NOW).nights).toBe(30);
    expect(() => parseStay('2026-10-01', '2026-11-01', NOW)).toThrow(
      `limited to ${MAX_STAY_NIGHTS} nights`,
    );
  });
});
