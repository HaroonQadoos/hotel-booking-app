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
// `import type`: isolatedModules + emitDecoratorMetadata reject a value
// import for a type that only appears in a decorated signature.
import type { AuthUser } from '../auth/types/auth-user';
import { VenueBookingsService } from './venue-bookings.service';
import { CreateVenueBookingDto } from './dto/create-venue-booking.dto';
import { FindVenueBookingsDto } from './dto/find-venue-bookings.dto';
import { VenueBookingResponseDto } from './dto/venue-booking-response.dto';

// Every route needs a signed-in user: bookings belong to someone.
@Controller('venue-bookings')
@UseGuards(JwtAuthGuard)
export class VenueBookingsController {
  constructor(private readonly venueBookingsService: VenueBookingsService) {}

  @Post()
  async create(
    @Body() dto: CreateVenueBookingDto,
    @CurrentUser() user: AuthUser,
  ) {
    const booking = await this.venueBookingsService.create(user.userId, dto);
    return new VenueBookingResponseDto(booking);
  }

  // Admin-only: every guest's venue bookings.
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async findAll(@Query() query: FindVenueBookingsDto) {
    const bookings = await this.venueBookingsService.findAll(query);
    return bookings.map((b) => new VenueBookingResponseDto(b));
  }

  // Must stay above @Get(':id') — Nest matches in declaration order, and a
  // ':id' declared first would capture "me" and try to load it as an id.
  @Get('me')
  async findMine(@CurrentUser() user: AuthUser) {
    const bookings = await this.venueBookingsService.findForUser(user.userId);
    return bookings.map((b) => new VenueBookingResponseDto(b));
  }

  // Admin-only, for the dashboard badge. Above @Get(':id') for the same
  // reason as 'me'.
  @Get('pending-count')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async countPending() {
    return { count: await this.venueBookingsService.countPending() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const booking = await this.venueBookingsService.findOne(id, user);
    return new VenueBookingResponseDto(booking);
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const booking = await this.venueBookingsService.cancel(id, user);
    return new VenueBookingResponseDto(booking);
  }

  // Admin-only: accept a guest's request, pending -> confirmed.
  @Patch(':id/confirm')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const booking = await this.venueBookingsService.confirm(id, user);
    return new VenueBookingResponseDto(booking);
  }
}
