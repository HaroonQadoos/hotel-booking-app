import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { VENUE_TYPES } from '../schemas/venue.schema';
import type { VenueType } from '../schemas/venue.schema';

// Query string filters for the public venue list; nothing set returns every
// active venue.
export class FindVenuesDto {
  @IsOptional()
  @IsIn(VENUE_TYPES)
  type?: VenueType;

  // Query params arrive as strings; @Type is what makes @IsInt see a number.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;
}
