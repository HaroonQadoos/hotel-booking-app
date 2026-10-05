import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import {
  HotelLocation,
  HotelLocationSchema,
} from './schemas/hotel-location.schema';

// Where the hotel is: a map pin and a description, set from the dashboard and
// shown on the guest site's front page.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HotelLocation.name, schema: HotelLocationSchema },
    ]),
  ],
  controllers: [LocationController],
  providers: [LocationService],
})
export class LocationModule {}
