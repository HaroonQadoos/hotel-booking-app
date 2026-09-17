import { IsInt, IsMongoId, IsISO8601, Min } from 'class-validator';

export class CreateBookingDto {
  @IsMongoId()
  room!: string;

  // Date-only ISO strings ("2026-10-03"). A full timestamp is rejected so the
  // client cannot smuggle a time of day into what is a night-based booking.
  @IsISO8601({ strict: true, strictSeparator: true })
  checkIn!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  checkOut!: string;

  @IsInt()
  @Min(1)
  guests!: number;
}
