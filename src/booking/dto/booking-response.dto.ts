import { Types } from 'mongoose';
import { Booking, BookingStatus } from '../schemas/booking.schema';
import { nightsBetween } from '../stay-dates';

// `room` is populated with a summary on every read path in BookingService,
// so the client can show "Deluxe Double" without a second request.
interface RoomSummary {
  id: string;
  name?: string;
  type?: string;
}

function summariseRoom(room: Booking['room']): RoomSummary {
  if (room instanceof Types.ObjectId) return { id: String(room) };
  const populated = room as unknown as {
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

export class BookingResponseDto {
  id: string;
  user: string;
  room: RoomSummary;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  totalPrice: number;
  status: BookingStatus;
  createdAt: Date;

  constructor(booking: Booking) {
    this.id = String(booking._id);
    this.user = String(booking.user);
    this.room = summariseRoom(booking.room);
    // Dates go out the way they came in: as "YYYY-MM-DD", not a timestamp.
    this.checkIn = booking.checkIn.toISOString().slice(0, 10);
    this.checkOut = booking.checkOut.toISOString().slice(0, 10);
    this.nights = nightsBetween(booking.checkIn, booking.checkOut);
    this.guests = booking.guests;
    this.totalPrice = booking.totalPrice;
    this.status = booking.status;
    this.createdAt = booking.createdAt;
  }
}
