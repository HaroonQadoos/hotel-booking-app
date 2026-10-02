import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VenuesController } from './venues.controller';
import { VenueBookingsController } from './venue-bookings.controller';
import { VenuesService } from './venues.service';
import { VenueBookingsService } from './venue-bookings.service';
import { Venue, VenueSchema } from './schemas/venue.schema';
import {
  VenueBooking,
  VenueBookingSchema,
} from './schemas/venue-booking.schema';

// Venues and their bookings live in one module: unlike rooms, nothing else
// needs a venue, so there is no dependency to keep one-way.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Venue.name, schema: VenueSchema },
      { name: VenueBooking.name, schema: VenueBookingSchema },
    ]),
  ],
  controllers: [VenuesController, VenueBookingsController],
  providers: [VenuesService, VenueBookingsService],
})
export class VenuesModule {}
