import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
// `import type` is required: isolatedModules + emitDecoratorMetadata reject a
// value import for a type that only appears in a decorated signature.
import type { AuthUser } from '../auth/types/auth-user';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { FindBookingsDto } from './dto/find-bookings.dto';
import { BookingResponseDto } from './dto/booking-response.dto';

// Every route needs a signed-in user: bookings belong to someone.
@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  async create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthUser) {
    const booking = await this.bookingService.create(user.userId, dto);
    return new BookingResponseDto(booking);
  }

  // Admin-only: every guest's bookings.
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async findAll(@Query() query: FindBookingsDto) {
    const bookings = await this.bookingService.findAll(query);
    return bookings.map((b) => new BookingResponseDto(b));
  }

  // Must stay above @Get(':id') — Nest matches in declaration order, and a
  // ':id' declared first would capture "me" and try to load it as an id.
  @Get('me')
  async findMine(@CurrentUser() user: AuthUser) {
    const bookings = await this.bookingService.findForUser(user.userId);
    return bookings.map((b) => new BookingResponseDto(b));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const booking = await this.bookingService.findOne(id, user);
    return new BookingResponseDto(booking);
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const booking = await this.bookingService.cancel(id, user);
    return new BookingResponseDto(booking);
  }
}
