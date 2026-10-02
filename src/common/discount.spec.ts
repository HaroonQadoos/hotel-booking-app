import {
  applyDiscount,
  isDiscountActiveOn,
  isValidDiscountWindow,
  priceNights,
  priceOn,
  roundMoney,
} from './discount';

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe('discount', () => {
  describe('isDiscountActiveOn', () => {
    const sale = {
      discountPercent: 20,
      discountStartsAt: '2026-12-20',
      discountEndsAt: '2026-12-31',
    };

    // Both bounds are inclusive.
    it.each([
      ['2026-12-19', false],
      ['2026-12-20', true],
      ['2026-12-25', true],
      ['2026-12-31', true],
      ['2027-01-01', false],
    ])('on %s → %s', (date, expected) => {
      expect(isDiscountActiveOn(sale, day(date))).toBe(expected);
    });

    it('treats a null bound as open-ended', () => {
      const open = { discountPercent: 10, discountStartsAt: null };
      expect(isDiscountActiveOn(open, day('1999-01-01'))).toBe(true);
      expect(isDiscountActiveOn(open, day('2099-01-01'))).toBe(true);
    });

    it('is never active at 0% or with no percent at all', () => {
      expect(
        isDiscountActiveOn({ discountPercent: 0 }, day('2026-12-25')),
      ).toBe(false);
      expect(isDiscountActiveOn({}, day('2026-12-25'))).toBe(false);
    });

    // Late in the UTC day: a local-time conversion could slip to the next day.
    it('uses the UTC calendar date of the timestamp', () => {
      const s = { discountPercent: 10, discountEndsAt: '2026-12-31' };
      expect(isDiscountActiveOn(s, new Date('2026-12-31T23:59:00Z'))).toBe(
        true,
      );
    });
  });

  describe('applyDiscount', () => {
    it('rounds to whole cents without float drift', () => {
      // 89 * 0.85 is 75.6499… in floating point.
      expect(applyDiscount(89, 15)).toBe(75.65);
      expect(applyDiscount(139.99, 33)).toBe(93.79);
      expect(applyDiscount(100, 0)).toBe(100);
    });
  });

  describe('priceOn', () => {
    it('discounts only inside the window', () => {
      const s = { discountPercent: 50, discountStartsAt: '2026-12-01' };
      expect(priceOn(100, s, day('2026-11-30'))).toBe(100);
      expect(priceOn(100, s, day('2026-12-01'))).toBe(50);
    });
  });

  describe('priceNights', () => {
    it('charges full price with no sale', () => {
      expect(priceNights(100, {}, day('2026-12-01'), 3)).toBe(300);
    });

    // Nights of the 30th and 31st are in the sale; the 1st and 2nd are not.
    it('prices each night on its own date', () => {
      const s = { discountPercent: 25, discountEndsAt: '2026-12-31' };
      expect(priceNights(100, s, day('2026-12-30'), 4)).toBe(
        75 + 75 + 100 + 100,
      );
    });

    it('sums in cents so totals stay at 2 dp', () => {
      expect(priceNights(0.1, {}, day('2026-12-01'), 3)).toBe(0.3);
    });
  });

  describe('isValidDiscountWindow', () => {
    it.each([
      ['2026-12-01', '2026-12-31', true],
      ['2026-12-01', '2026-12-01', true],
      ['2026-12-31', '2026-12-01', false],
      [null, '2026-12-01', true],
      ['2026-12-01', null, true],
      [undefined, undefined, true],
    ])('%s → %s is %s', (start, end, expected) => {
      expect(isValidDiscountWindow(start, end)).toBe(expected);
    });
  });

  it('roundMoney rounds to 2 dp', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});
