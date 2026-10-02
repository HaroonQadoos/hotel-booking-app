import { CreateVenueDto } from '../venues/dto/create-venue.dto';

// One of each kind of venue. As with rooms, the name is the identity, so
// re-running the seed updates these in place.
export const VENUE_SEED: CreateVenueDto[] = [
  {
    name: 'Skyline Conference Room',
    description:
      'A boardroom on the top floor with a 20-seat table, a 4K projector, and video-conferencing kit. Coffee service on request.',
    type: 'conference',
    pricePerHour: 75,
    capacity: 20,
    openingHour: 8,
    closingHour: 20,
    minHours: 2,
    maxHours: 10,
    amenities: ['Projector', 'Video conferencing', 'Whiteboard', 'Wi-Fi'],
    images: [],
  },
  {
    name: 'Rooftop Swimming Pool',
    description:
      'A heated rooftop pool with sun loungers and a poolside bar, available for private hire.',
    type: 'pool',
    pricePerHour: 120,
    capacity: 30,
    openingHour: 7,
    closingHour: 22,
    minHours: 1,
    maxHours: 6,
    amenities: ['Heated pool', 'Sun loungers', 'Towels', 'Poolside bar'],
    images: [],
  },
  {
    name: 'Celebration Birthday Hall',
    description:
      'A bright party hall with a dance floor, sound system, and a cake table. Decorations can be arranged with the front desk.',
    type: 'hall',
    pricePerHour: 90,
    capacity: 60,
    openingHour: 10,
    closingHour: 23,
    minHours: 3,
    maxHours: 8,
    amenities: ['Sound system', 'Dance floor', 'Cake table', 'Decorations'],
    images: [],
  },
];
