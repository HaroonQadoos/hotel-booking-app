import { RoomResponseDto } from '../../rooms/dto/room-response.dto';
import { Room } from '../../rooms/schemas/room.schema';

export class AvailableRoomDto extends RoomResponseDto {
  // Units free for the requested stay. 0 means sold out for those dates.
  availableUnits: number;
  // What the searched stay would cost, each night priced on its own date —
  // the same figure BookingService.create would snapshot.
  totalPrice: number;

  constructor(room: Room, availableUnits: number, totalPrice: number) {
    super(room);
    this.availableUnits = availableUnits;
    this.totalPrice = totalPrice;
  }
}
