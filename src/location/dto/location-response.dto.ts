import { HotelLocation } from '../schemas/hotel-location.schema';

export class LocationResponseDto {
  latitude: number;
  longitude: number;
  zoom: number;
  address: string;
  description: string;

  constructor(location: HotelLocation) {
    this.latitude = location.latitude;
    this.longitude = location.longitude;
    this.zoom = location.zoom;
    this.address = location.address ?? '';
    this.description = location.description ?? '';
  }
}
