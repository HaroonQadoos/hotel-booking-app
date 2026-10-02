import { applyDiscount, isDiscountActiveOn } from '../../common/discount';
import { Venue, VenueType } from '../schemas/venue.schema';

export class VenueResponseDto {
  id: string;
  name: string;
  description: string;
  type: VenueType;
  pricePerHour: number;
  capacity: number;
  openingHour: number;
  closingHour: number;
  minHours: number;
  maxHours: number;
  amenities: string[];
  images: string[];
  isActive: boolean;
  discountPercent: number;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  // Computed for today (UTC); a booking is priced on its own date.
  discountActive: boolean;
  effectivePricePerHour: number;

  constructor(venue: Venue, now: Date = new Date()) {
    this.id = String(venue._id);
    this.name = venue.name;
    this.description = venue.description;
    this.type = venue.type;
    this.pricePerHour = venue.pricePerHour;
    this.capacity = venue.capacity;
    this.openingHour = venue.openingHour;
    this.closingHour = venue.closingHour;
    this.minHours = venue.minHours;
    this.maxHours = venue.maxHours;
    this.amenities = venue.amenities;
    this.images = venue.images;
    this.isActive = venue.isActive;
    this.discountPercent = venue.discountPercent ?? 0;
    this.discountStartsAt = venue.discountStartsAt ?? null;
    this.discountEndsAt = venue.discountEndsAt ?? null;
    this.discountActive = isDiscountActiveOn(venue, now);
    this.effectivePricePerHour = this.discountActive
      ? applyDiscount(venue.pricePerHour, this.discountPercent)
      : venue.pricePerHour;
  }
}
