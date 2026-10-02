import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { BOOKING_STATUSES } from '../../booking/schemas/booking.schema';
import type { BookingStatus } from '../../booking/schemas/booking.schema';

// Admin listing filters. All optional; nothing set returns every booking.
export class FindVenueBookingsDto {
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatus;

  // Bookings whose date falls in [from, to) — the same half-open window as
  // the room bookings filter. Either bound alone is open-ended.
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;
}
