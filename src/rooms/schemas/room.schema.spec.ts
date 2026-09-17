import { ROOM_TYPES, RoomSchema } from './room.schema';

// The schema is the last line of defence: DTO validation covers the HTTP
// layer, but a seed script or a service bug writes straight to Mongoose.
describe('Room schema', () => {
  it.each([
    'name',
    'description',
    'type',
    'pricePerNight',
    'capacity',
    'totalUnits',
  ])('requires %s', (path) => {
    expect(RoomSchema.path(path).options.required).toBe(true);
  });

  it('restricts type to the known room types', () => {
    expect(RoomSchema.path('type').options.enum).toEqual(ROOM_TYPES);
  });

  it('enforces a unique name', () => {
    expect(RoomSchema.path('name').options.unique).toBe(true);
  });

  it.each([
    ['pricePerNight', 0],
    ['capacity', 1],
    ['totalUnits', 0],
  ])('bounds %s at a minimum of %d', (path, min) => {
    expect(RoomSchema.path(path).options.min).toBe(min);
  });

  it('starts every new room type active', () => {
    expect(RoomSchema.path('isActive').options.default).toBe(true);
  });

  it('defaults amenities and images to empty lists', () => {
    expect(RoomSchema.path('amenities').options.default).toEqual([]);
    expect(RoomSchema.path('images').options.default).toEqual([]);
  });
});
