import { IsISO8601 } from 'class-validator';

// GET /venues/:id/availability?date=YYYY-MM-DD
export class VenueAvailabilityQueryDto {
  @IsISO8601({ strict: true, strictSeparator: true })
  date!: string;
}
