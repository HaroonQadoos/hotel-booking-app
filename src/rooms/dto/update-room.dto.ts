import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateRoomDto } from './create-room.dto';

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  // Not on CreateRoomDto: a new room type is always active. Exposed here so
  // staff can re-list a type that was removed with DELETE.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
