import { Types } from 'mongoose';
import type { BookingStatus } from '../../booking/schemas/booking.schema';
import { VenueBooking } from '../schemas/venue-booking.schema';

// `venue` is populated with a summary on every read path in
// VenueBookingsService, so the client can show the name without a second
// request.
interface VenueSummary {
  id: string;
  name?: string;
  type?: string;
}

function summariseVenue(venue: VenueBooking['venue']): VenueSummary {
  if (venue instanceof Types.ObjectId) return { id: String(venue) };
  const populated = venue as unknown as {
    _id: unknown;
    name?: string;
    type?: string;
  };
  return {
    id: String(populated._id),
    name: populated.name,
    type: populated.type,
  };
}

export class VenueBookingResponseDto {
  id: string;
  user: string;
  venue: VenueSummary;
  date: string;
  startHour: number;
  endHour: number;
  hours: number;
  guests: number;
  notes: string | null;
  totalPrice: number;
  status: BookingStatus;
  createdAt: Date;

  constructor(booking: VenueBooking) {
    this.id = String(booking._id);
    this.user = String(booking.user);
    this.venue = summariseVenue(booking.venue);
    // Out as "YYYY-MM-DD", the way it came in.
    this.date = booking.date.toISOString().slice(0, 10);
    this.startHour = booking.startHour;
    this.endHour = booking.endHour;
    this.hours = booking.endHour - booking.startHour;
    this.guests = booking.guests;
    this.notes = booking.notes ?? null;
    this.totalPrice = booking.totalPrice;
    this.status = booking.status;
    this.createdAt = booking.createdAt;
  }
}
