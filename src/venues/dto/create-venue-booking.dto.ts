import {
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Hours against the venue's own opening times, and endHour > startHour, are
// checked in VenueBookingsService once the venue is loaded.
export class CreateVenueBookingDto {
  @IsMongoId()
  venue!: string;

  // Date-only ("2026-10-03"); the time of day is carried by the hours.
  @IsISO8601({ strict: true, strictSeparator: true })
  date!: string;

  @IsInt()
  @Min(0)
  @Max(23)
  startHour!: number;

  @IsInt()
  @Min(1)
  @Max(24)
  endHour!: number;

  @IsInt()
  @Min(1)
  guests!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
