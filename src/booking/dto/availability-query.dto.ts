import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

// GET /availability?checkIn=&checkOut=&guests= — the search behind the
// home page. Dates are required: without them there is nothing to check.
export class AvailabilityQueryDto {
  @IsISO8601({ strict: true, strictSeparator: true })
  checkIn!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  checkOut!: string;

  // Query params arrive as strings; @Type is what makes @IsInt see a number.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;
}
