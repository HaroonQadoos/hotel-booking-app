import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  BOOKING_STATUSES,
  type BookingStatus,
} from '../../booking/schemas/booking.schema';

// Same lifecycle as a room booking — pending until staff accept it, and only
// cancellation frees the slot — so the status list is shared, not copied.
@Schema({ timestamps: true, collection: 'venuebookings' })
export class VenueBooking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Venue', required: true, index: true })
  venue!: Types.ObjectId;

  // The day of the hire, stored at UTC midnight like stay dates.
  @Prop({ required: true })
  date!: Date;

  // [startHour, endHour) in hotel local time: a booking ending at 14 and one
  // starting at 14 do not overlap.
  @Prop({ required: true, min: 0, max: 23 })
  startHour!: number;

  @Prop({ required: true, min: 1, max: 24 })
  endHour!: number;

  @Prop({ required: true, min: 1 })
  guests!: number;

  @Prop({ trim: true, maxlength: 500 })
  notes?: string;

  // Snapshotted at booking time, like Booking.totalPrice.
  @Prop({ required: true, min: 0 })
  totalPrice!: number;

  @Prop({
    type: String,
    required: true,
    enum: BOOKING_STATUSES,
    default: 'pending',
  })
  status!: BookingStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const VenueBookingSchema = SchemaFactory.createForClass(VenueBooking);

// Serves the overlap check and the day's availability: venue + status, then
// the day, then the hours.
VenueBookingSchema.index({ venue: 1, status: 1, date: 1, startHour: 1 });
