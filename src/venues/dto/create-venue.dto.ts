import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsRichText } from '../../common/rich-text';
import { DiscountFieldsDto } from '../../common/discount.dto';
import { VENUE_TYPES } from '../schemas/venue.schema';
// `import type`: isolatedModules + emitDecoratorMetadata reject a value
// import for a type that only appears in a decorated signature.
import type { VenueType } from '../schemas/venue.schema';

// Closing-after-opening and max-after-min are checked in VenuesService, not
// here: either side may be omitted and fall back to a default (or, on PATCH,
// to the stored value), which a field decorator cannot see.
export class CreateVenueDto extends DiscountFieldsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  // HTML from the dashboard's rich-text editor; sanitised before validation.
  @IsRichText(10, 2000)
  description!: string;

  @IsIn(VENUE_TYPES)
  type!: VenueType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerHour!: number;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  openingHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  closingHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxHours?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  // require_tld off: photos uploaded in dev live at http://localhost:3000/….
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { each: true },
  )
  images?: string[];
}
