import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateVenueDto } from './create-venue.dto';

export class UpdateVenueDto extends PartialType(CreateVenueDto) {
  // Not on CreateVenueDto: a new venue is always active. Exposed here so
  // staff can re-list one that was removed with DELETE.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
