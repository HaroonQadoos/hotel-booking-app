import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HOTEL_LOCATION_KEY,
  HotelLocation,
  LOCATION_DEFAULTS,
} from './schemas/hotel-location.schema';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationService {
  constructor(
    @InjectModel(HotelLocation.name)
    private locationModel: Model<HotelLocation>,
  ) {}

  // null until staff first set one; the guest site then shows no map at all.
  async get(): Promise<HotelLocation | null> {
    return this.locationModel.findOne({ key: HOTEL_LOCATION_KEY }).exec();
  }

  // Creates the document on the first save, replaces its fields after. Fields
  // left out fall back to their defaults so a PUT means the same thing twice.
  async set(dto: UpdateLocationDto): Promise<HotelLocation> {
    return this.locationModel
      .findOneAndUpdate(
        { key: HOTEL_LOCATION_KEY },
        {
          latitude: dto.latitude,
          longitude: dto.longitude,
          zoom: dto.zoom ?? LOCATION_DEFAULTS.zoom,
          address: dto.address ?? '',
          description: dto.description ?? '',
        },
        { upsert: true, new: true, runValidators: true },
      )
      .exec();
  }
}
