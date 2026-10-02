import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DATE_ONLY, MAX_DISCOUNT_PERCENT } from '../../common/discount';

// A Venue is ONE bookable space hired by the hour — unlike a Room, there is
// no totalUnits: any two holding bookings that overlap in time conflict.
export const VENUE_TYPES = ['conference', 'pool', 'hall'] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

// Used by the service to check cross-field rules (closing after opening,
// max after min) on a create that leaves some of these out.
export const VENUE_DEFAULTS = {
  openingHour: 8,
  closingHour: 22,
  minHours: 1,
  maxHours: 12,
} as const;

@Schema({ timestamps: true })
export class Venue extends Document {
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  // type: String — a string-literal union gives the decorator nothing to
  // reflect on.
  @Prop({ type: String, required: true, enum: VENUE_TYPES })
  type!: VenueType;

  @Prop({ required: true, min: 0 })
  pricePerHour!: number;

  // Maximum guests at once.
  @Prop({ required: true, min: 1 })
  capacity!: number;

  // Whole hours in hotel local time. A slot is [startHour, endHour), so a
  // closingHour of 24 means open until midnight.
  @Prop({ default: VENUE_DEFAULTS.openingHour, min: 0, max: 23 })
  openingHour!: number;

  @Prop({ default: VENUE_DEFAULTS.closingHour, min: 1, max: 24 })
  closingHour!: number;

  @Prop({ default: VENUE_DEFAULTS.minHours, min: 1 })
  minHours!: number;

  @Prop({ default: VENUE_DEFAULTS.maxHours, min: 1 })
  maxHours!: number;

  @Prop({ type: [String], default: [] })
  amenities!: string[];

  @Prop({ type: [String], default: [] })
  images!: string[];

  // Same sale fields and rules as Room — see common/discount.ts.
  @Prop({ default: 0, min: 0, max: MAX_DISCOUNT_PERCENT })
  discountPercent!: number;

  @Prop({ type: String, default: null, match: DATE_ONLY })
  discountStartsAt!: string | null;

  @Prop({ type: String, default: null, match: DATE_ONLY })
  discountEndsAt!: string | null;

  // Soft delete, as for rooms: venue bookings keep referencing it.
  @Prop({ default: true })
  isActive!: boolean;
}

export const VenueSchema = SchemaFactory.createForClass(Venue);
