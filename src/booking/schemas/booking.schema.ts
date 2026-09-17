import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// pending: created, awaiting payment (no payment step exists yet — every new
//          booking sits here until one is added).
// confirmed: paid. Reserved for the payment flow; nothing sets it today.
// cancelled: released. The only status that frees the room.
export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// A pending booking holds a room just like a confirmed one; otherwise two
// guests could both pay for the last unit. Availability counts both.
export const HOLDING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'confirmed',
];

@Schema({ timestamps: true })
export class Booking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
  room!: Types.ObjectId;

  // Date-only, stored at UTC midnight. A stay is [checkIn, checkOut): the
  // guest leaves on checkOut morning, so a booking ending that day and one
  // starting that day do not overlap.
  @Prop({ required: true })
  checkIn!: Date;

  @Prop({ required: true })
  checkOut!: Date;

  @Prop({ required: true, min: 1 })
  guests!: number;

  // Snapshotted at booking time: a later price change must not rewrite what
  // this guest agreed to pay.
  @Prop({ required: true, min: 0 })
  totalPrice!: number;

  @Prop({
    type: String,
    required: true,
    enum: BOOKING_STATUSES,
    default: 'pending',
  })
  status!: BookingStatus;

  // Written by `timestamps: true`; declared here only so they are typed.
  createdAt!: Date;
  updatedAt!: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

// The availability query filters on room + status and then on the date range;
// this is the index that serves it.
BookingSchema.index({ room: 1, status: 1, checkIn: 1, checkOut: 1 });
