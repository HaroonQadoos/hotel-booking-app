import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DATE_ONLY, MAX_DISCOUNT_PERCENT } from '../../common/discount';

// A Room is a room *type* the hotel sells — "Deluxe Double" — not one physical
// door. totalUnits says how many identical ones exist; availability for a date
// range is totalUnits minus the bookings that overlap it. Modelling each
// physical room separately would mean assigning a specific door at booking
// time, which is a front-desk decision, not a customer one.
export const ROOM_TYPES = ['single', 'double', 'suite'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

@Schema({ timestamps: true })
export class Room extends Document {
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  // type: String is explicit because a string-literal union gives the
  // decorator nothing to reflect on — it cannot infer a runtime type from it.
  @Prop({ type: String, required: true, enum: ROOM_TYPES })
  type!: RoomType;

  // Whole units of the hotel's currency per night. Currency is a hotel-wide
  // setting, not per room, so it does not live here.
  @Prop({ required: true, min: 0 })
  pricePerNight!: number;

  // Maximum guests, used to filter room types out of a search.
  @Prop({ required: true, min: 1 })
  capacity!: number;

  // Number of identical rooms of this type. Zero is legal — it lets staff
  // define a type before any rooms of it are ready to sell.
  @Prop({ required: true, min: 0 })
  totalUnits!: number;

  @Prop({ type: [String], default: [] })
  amenities!: string[];

  @Prop({ type: [String], default: [] })
  images!: string[];

  // A sale: 0 means none. The window bounds are inclusive "YYYY-MM-DD" dates,
  // null for open-ended. Stored as strings, not Dates, because they are
  // calendar days the admin typed, and they go back out exactly as typed.
  // See common/discount.ts for how they are applied.
  @Prop({ default: 0, min: 0, max: MAX_DISCOUNT_PERCENT })
  discountPercent!: number;

  @Prop({ type: String, default: null, match: DATE_ONLY })
  discountStartsAt!: string | null;

  @Prop({ type: String, default: null, match: DATE_ONLY })
  discountEndsAt!: string | null;

  // Removing a room type is a soft delete: bookings reference it, and a hard
  // delete would leave them pointing at nothing. Inactive types are hidden
  // from guests but stay readable for existing bookings and for staff.
  @Prop({ default: true })
  isActive!: boolean;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
