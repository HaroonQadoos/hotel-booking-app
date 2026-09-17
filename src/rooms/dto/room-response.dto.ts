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

  constructor(room: Room) {
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
  }
}
