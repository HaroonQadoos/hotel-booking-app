import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoomDto } from '../rooms/dto/create-room.dto';
import { UpdateRoomDto } from '../rooms/dto/update-room.dto';

const room = {
  name: 'Deluxe Double',
  description: 'A comfortable double room with a city view.',
  type: 'double',
  pricePerNight: 120,
  capacity: 2,
  totalUnits: 8,
};

async function errorsOn(cls: new () => object, body: object) {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

// Exercised through the room DTOs: what matters is that the rules reach the
// real create and update payloads, including through PartialType.
describe('DiscountFieldsDto', () => {
  it('accepts a full sale', async () => {
    await expect(
      errorsOn(CreateRoomDto, {
        ...room,
        discountPercent: 20,
        discountStartsAt: '2026-12-01',
        discountEndsAt: '2026-12-31',
      }),
    ).resolves.toEqual([]);
  });

  it.each([-1, 91, 12.5])('rejects discountPercent %p', async (pct) => {
    await expect(
      errorsOn(CreateRoomDto, { ...room, discountPercent: pct }),
    ).resolves.toEqual(['discountPercent']);
  });

  it.each(['2026-12-01T00:00:00Z', '2026-02-31', '01/12/2026'])(
    'rejects the date %s',
    async (value) => {
      await expect(
        errorsOn(UpdateRoomDto, { discountStartsAt: value }),
      ).resolves.toEqual(['discountStartsAt']);
    },
  );

  it('rejects an end before the start', async () => {
    await expect(
      errorsOn(UpdateRoomDto, {
        discountStartsAt: '2026-12-31',
        discountEndsAt: '2026-12-01',
      }),
    ).resolves.toEqual(['discountEndsAt']);
  });

  it('accepts a one-day sale', async () => {
    await expect(
      errorsOn(UpdateRoomDto, {
        discountStartsAt: '2026-12-25',
        discountEndsAt: '2026-12-25',
      }),
    ).resolves.toEqual([]);
  });

  // null is how the dashboard clears a bound.
  it('lets a PATCH clear the bounds with null', async () => {
    await expect(
      errorsOn(UpdateRoomDto, { discountStartsAt: null, discountEndsAt: null }),
    ).resolves.toEqual([]);
  });
});
