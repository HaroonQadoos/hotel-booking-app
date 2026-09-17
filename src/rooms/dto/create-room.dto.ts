import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ROOM_TYPES } from '../schemas/room.schema';
// `import type` is required: isolatedModules + emitDecoratorMetadata reject a
// value import for a type that only appears in a decorated signature.
import type { RoomType } from '../schemas/room.schema';

export class CreateRoomDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsIn(ROOM_TYPES)
  type!: RoomType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerNight!: number;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsInt()
  @Min(0)
  totalUnits!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({}, { each: true })
  images?: string[];
}
