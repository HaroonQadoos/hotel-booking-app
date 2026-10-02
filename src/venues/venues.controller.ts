import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { VenuesService } from './venues.service';
import { VenueBookingsService } from './venue-bookings.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { FindVenuesDto } from './dto/find-venues.dto';
import { VenueAvailabilityQueryDto } from './dto/venue-availability-query.dto';
import { VenueResponseDto } from './dto/venue-response.dto';

@Controller('venues')
export class VenuesController {
  constructor(
    private readonly venuesService: VenuesService,
    private readonly venueBookingsService: VenueBookingsService,
  ) {}

  // Public on purpose: guests browse before they sign up.
  @Get()
  async findAvailable(@Query() query: FindVenuesDto) {
    const venues = await this.venuesService.findAvailable(query);
    return venues.map((v) => new VenueResponseDto(v));
  }

  // Must stay above @Get(':id') — Nest matches in declaration order, and a
  // ':id' declared first would capture "all" and try to load it as an id.
  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async findAll() {
    const venues = await this.venuesService.findAll();
    return venues.map((v) => new VenueResponseDto(v));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findOne(id);
    return new VenueResponseDto(venue);
  }

  // Public, like the room search: the booked hours only, no guest details.
  @Get(':id/availability')
  async availability(
    @Param('id') id: string,
    @Query() query: VenueAvailabilityQueryDto,
  ) {
    return this.venueBookingsService.findDayAvailability(id, query.date);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateVenueDto) {
    const venue = await this.venuesService.create(dto);
    return new VenueResponseDto(venue);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateVenueDto) {
    const venue = await this.venuesService.update(id, dto);
    return new VenueResponseDto(venue);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.venuesService.remove(id);
  }
}
