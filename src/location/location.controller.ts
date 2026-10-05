import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LocationService } from './location.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationResponseDto } from './dto/location-response.dto';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  // Public: the front page shows it to anyone. `{ location: null }` rather
  // than an empty body, so "not set yet" is a normal answer, not an error.
  @Get()
  async get() {
    const location = await this.locationService.get();
    return { location: location ? new LocationResponseDto(location) : null };
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async set(@Body() dto: UpdateLocationDto) {
    const location = await this.locationService.set(dto);
    return { location: new LocationResponseDto(location) };
  }
}
