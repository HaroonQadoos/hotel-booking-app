import { RoomResponseDto } from '../../rooms/dto/room-response.dto';
import { Room } from '../../rooms/schemas/room.schema';

export class AvailableRoomDto extends RoomResponseDto {
  // Units free for the requested stay. 0 means sold out for those dates.
  availableUnits: number;

  constructor(room: Room, availableUnits: number) {
    super(room);
    this.availableUnits = availableUnits;
  }
}
