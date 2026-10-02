import { applyDiscount, isDiscountActiveOn } from '../../common/discount';
import { Room, RoomType } from '../schemas/room.schema';

export class RoomResponseDto {
  id: string;
  name: string;
  description: string;
  type: RoomType;
  pricePerNight: number;
  capacity: number;
  totalUnits: number;
  amenities: string[];
  images: string[];
  isActive: boolean;
  discountPercent: number;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  // Computed for today (UTC) so clients can show "was / now" without
  // reimplementing the window rules. A booking prices each night separately.
  discountActive: boolean;
  effectivePricePerNight: number;

  constructor(room: Room, now: Date = new Date()) {
    this.id = String(room._id);
    this.name = room.name;
    this.description = room.description;
    this.type = room.type;
    this.pricePerNight = room.pricePerNight;
    this.capacity = room.capacity;
    this.totalUnits = room.totalUnits;
    this.amenities = room.amenities;
    this.images = room.images;
    this.isActive = room.isActive;
    // ?? covers rooms stored before discounts existed.
    this.discountPercent = room.discountPercent ?? 0;
    this.discountStartsAt = room.discountStartsAt ?? null;
    this.discountEndsAt = room.discountEndsAt ?? null;
    this.discountActive = isDiscountActiveOn(room, now);
    this.effectivePricePerNight = this.discountActive
      ? applyDiscount(room.pricePerNight, this.discountPercent)
      : room.pricePerNight;
  }
}
