import { Controller, Get, Query } from '@nestjs/common';
import { BookingService } from './booking.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { AvailableRoomDto } from './dto/available-room.dto';

// Lives in the booking module rather than under /rooms because availability
// is a property of bookings, and RoomsModule must not depend on this one.
// Public on purpose: guests search before they sign up.
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  async search(@Query() query: AvailabilityQueryDto) {
    const results = await this.bookingService.findAvailableRooms(
      query.checkIn,
      query.checkOut,
      query.guests,
    );
    return results.map((r) => new AvailableRoomDto(r.room, r.availableUnits));
  }
}
