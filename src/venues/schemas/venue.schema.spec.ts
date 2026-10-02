import { VENUE_DEFAULTS, VENUE_TYPES, VenueSchema } from './venue.schema';

describe('Venue schema', () => {
  it.each(['name', 'description', 'type', 'pricePerHour', 'capacity'])(
    'requires %s',
    (path) => {
      expect(VenueSchema.path(path).options.required).toBe(true);
    },
  );

  it('restricts type to conference, pool and hall', () => {
    expect(VENUE_TYPES).toEqual(['conference', 'pool', 'hall']);
    expect(VenueSchema.path('type').options.enum).toEqual(VENUE_TYPES);
  });

  it('enforces a unique name', () => {
    expect(VenueSchema.path('name').options.unique).toBe(true);
  });

  it.each([
    ['pricePerHour', 0],
    ['capacity', 1],
    ['openingHour', 0],
    ['closingHour', 1],
    ['minHours', 1],
    ['maxHours', 1],
  ])('bounds %s at a minimum of %d', (path, min) => {
    expect(VenueSchema.path(path).options.min).toBe(min);
  });

  it('keeps opening hours within a day', () => {
    expect(VenueSchema.path('openingHour').options.max).toBe(23);
    expect(VenueSchema.path('closingHour').options.max).toBe(24);
  });

  it.each(Object.entries(VENUE_DEFAULTS))('defaults %s to %d', (path, v) => {
    expect(VenueSchema.path(path).options.default).toBe(v);
  });

  it('starts with no sale, active, and empty lists', () => {
    expect(VenueSchema.path('discountPercent').options.default).toBe(0);
    expect(VenueSchema.path('discountPercent').options.max).toBe(90);
    expect(VenueSchema.path('discountStartsAt').options.default).toBeNull();
    expect(VenueSchema.path('discountEndsAt').options.default).toBeNull();
    expect(VenueSchema.path('isActive').options.default).toBe(true);
    expect(VenueSchema.path('amenities').options.default).toEqual([]);
    expect(VenueSchema.path('images').options.default).toEqual([]);
  });
});
