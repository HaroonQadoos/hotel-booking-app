import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomsModule } from '../rooms/rooms.module';
import { BookingController } from './booking.controller';
import { AvailabilityController } from './availability.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from './schemas/booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    RoomsModule,
  ],
  controllers: [BookingController, AvailabilityController],
  providers: [BookingService],
})
export class BookingModule {}
