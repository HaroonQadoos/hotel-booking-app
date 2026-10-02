import { BOOKING_STATUSES } from '../../booking/schemas/booking.schema';
import { VenueBooking, VenueBookingSchema } from './venue-booking.schema';

describe('VenueBooking schema', () => {
  it.each([
    'user',
    'venue',
    'date',
    'startHour',
    'endHour',
    'guests',
    'totalPrice',
    'status',
  ])('requires %s', (path) => {
    expect(VenueBookingSchema.path(path).options.required).toBe(true);
  });

  it('starts every booking pending, with the room booking statuses', () => {
    expect(VenueBookingSchema.path('status').options.default).toBe('pending');
    expect(VenueBookingSchema.path('status').options.enum).toEqual(
      BOOKING_STATUSES,
    );
  });

  it('keeps notes optional and short', () => {
    const notes = VenueBookingSchema.path('notes').options;
    expect(notes.required).toBeUndefined();
    expect(notes.maxlength).toBe(500);
  });

  it('bounds the hours to a day', () => {
    expect(VenueBookingSchema.path('startHour').options.min).toBe(0);
    expect(VenueBookingSchema.path('startHour').options.max).toBe(23);
    expect(VenueBookingSchema.path('endHour').options.min).toBe(1);
    expect(VenueBookingSchema.path('endHour').options.max).toBe(24);
  });

  it('lives in the venuebookings collection', () => {
    expect(VenueBookingSchema.get('collection')).toBe('venuebookings');
    expect(VenueBooking.name).toBe('VenueBooking');
  });

  it('indexes the overlap query', () => {
    const indexes = VenueBookingSchema.indexes().map(([fields]) => fields);
    expect(indexes).toContainEqual({
      venue: 1,
      status: 1,
      date: 1,
      startHour: 1,
    });
  });
});
