import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

// Query string filters for the public room list. Everything is optional: with
// nothing set, every active room type comes back.
export class FindRoomsDto {
  // Query params arrive as strings; @Type is what makes @IsInt see a number.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;
}
