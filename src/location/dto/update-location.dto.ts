import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsRichText } from '../../common/rich-text';

// The whole location at once: the dashboard always sends every field, and
// the pin only makes sense as a latitude/longitude pair.
export class UpdateLocationDto {
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(19)
  zoom?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  // May be empty: the map alone is a valid answer to "where are you?".
  @IsOptional()
  @IsRichText(0, 3000)
  description?: string;
}
