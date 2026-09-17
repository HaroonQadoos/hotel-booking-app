import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { BOOKING_STATUSES } from '../schemas/booking.schema';
import type { BookingStatus } from '../schemas/booking.schema';

// Admin listing filters. All optional; nothing set returns every booking.
export class FindBookingsDto {
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatus;

  // Bookings that overlap [from, to). Either bound alone is open-ended.
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;
}
