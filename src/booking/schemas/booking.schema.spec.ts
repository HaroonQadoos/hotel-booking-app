import {
  BOOKING_STATUSES,
  BookingSchema,
  HOLDING_STATUSES,
} from './booking.schema';

describe('Booking schema', () => {
  it.each([
    'user',
    'room',
    'checkIn',
    'checkOut',
    'guests',
    'totalPrice',
    'status',
  ])('requires %s', (path) => {
    expect(BookingSchema.path(path).options.required).toBe(true);
  });

  it('starts every booking pending, awaiting payment', () => {
    expect(BookingSchema.path('status').options.default).toBe('pending');
    expect(BookingSchema.path('status').options.enum).toEqual(BOOKING_STATUSES);
  });

  // A pending booking must hold its room; otherwise two guests could pay
  // for the last unit. Only cancellation releases one.
  it('treats pending and confirmed as holding a room', () => {
    expect(HOLDING_STATUSES).toEqual(['pending', 'confirmed']);
    expect(HOLDING_STATUSES).not.toContain('cancelled');
  });

  it('indexes the availability query', () => {
    const indexes = BookingSchema.indexes().map(([fields]) => fields);
    expect(indexes).toContainEqual({
      room: 1,
      status: 1,
      checkIn: 1,
      checkOut: 1,
    });
  });
});
