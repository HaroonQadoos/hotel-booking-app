import { Room } from '../schemas/room.schema';
import { RoomResponseDto } from './room-response.dto';

const NOW = new Date('2026-12-25T12:00:00Z');

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    _id: 'r1',
    name: 'Deluxe Double',
    pricePerNight: 139,
    amenities: [],
    images: [],
    discountPercent: 0,
    discountStartsAt: null,
    discountEndsAt: null,
    ...overrides,
  } as unknown as Room;
}

describe('RoomResponseDto', () => {
  it('shows the discounted price while a sale is on', () => {
    const dto = new RoomResponseDto(
      makeRoom({
        discountPercent: 15,
        discountStartsAt: '2026-12-20',
        discountEndsAt: '2026-12-31',
      }),
      NOW,
    );

    expect(dto.discountActive).toBe(true);
    expect(dto.effectivePricePerNight).toBe(118.15);
    expect(dto.discountStartsAt).toBe('2026-12-20');
  });

  it('shows the list price when the sale has not started', () => {
    const dto = new RoomResponseDto(
      makeRoom({ discountPercent: 15, discountStartsAt: '2027-01-01' }),
      NOW,
    );

    expect(dto.discountActive).toBe(false);
    expect(dto.effectivePricePerNight).toBe(139);
  });

  // Rooms stored before discounts existed have none of the fields.
  it('fills defaults for a room with no discount fields', () => {
    const legacy = makeRoom();
    const raw = legacy as unknown as Record<string, unknown>;
    delete raw.discountPercent;
    delete raw.discountStartsAt;
    delete raw.discountEndsAt;

    const dto = new RoomResponseDto(legacy, NOW);

    expect(dto).toMatchObject({
      discountPercent: 0,
      discountStartsAt: null,
      discountEndsAt: null,
      discountActive: false,
      effectivePricePerNight: 139,
    });
  });
});
