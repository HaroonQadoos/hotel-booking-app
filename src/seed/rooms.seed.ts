import { CreateRoomDto } from '../rooms/dto/create-room.dto';

// The hotel's initial inventory. Names are the identity — re-running the seed
// updates these rows in place rather than duplicating them.
export const ROOM_SEED: CreateRoomDto[] = [
  {
    name: 'Classic Single',
    description:
      'A quiet, compact room with a queen bed and a work desk. Ideal for solo travellers on business.',
    type: 'single',
    pricePerNight: 89,
    capacity: 1,
    totalUnits: 10,
    amenities: ['Wi-Fi', 'Air conditioning', 'Work desk', 'Tea & coffee'],
    images: [],
  },
  {
    name: 'Deluxe Double',
    description:
      'A bright double room with a king bed, city view, and a marble bathroom with a rain shower.',
    type: 'double',
    pricePerNight: 139,
    capacity: 2,
    totalUnits: 14,
    amenities: [
      'Wi-Fi',
      'Air conditioning',
      'City view',
      'Minibar',
      'Rain shower',
    ],
    images: [],
  },
  {
    name: 'Family Double',
    description:
      'Two queen beds and extra floor space, with a sofa bed for a fourth guest. Sleeps up to four.',
    type: 'double',
    pricePerNight: 179,
    capacity: 4,
    totalUnits: 6,
    amenities: ['Wi-Fi', 'Air conditioning', 'Sofa bed', 'Minibar', 'Bathtub'],
    images: [],
  },
  {
    name: 'Executive Suite',
    description:
      'A separate living room, a king bed, and a private balcony. Includes lounge access and late checkout.',
    type: 'suite',
    pricePerNight: 289,
    capacity: 3,
    totalUnits: 4,
    amenities: [
      'Wi-Fi',
      'Air conditioning',
      'Balcony',
      'Lounge access',
      'Late checkout',
      'Espresso machine',
    ],
    images: [],
  },
];
