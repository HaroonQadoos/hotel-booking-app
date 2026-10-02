import {
  IsInt,
  IsISO8601,
  IsOptional,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import {
  DATE_ONLY,
  isValidDiscountWindow,
  MAX_DISCOUNT_PERCENT,
} from './discount';

// Cross-field check: only fires when both bounds are in the same payload. A
// PATCH that sends one bound is checked against the stored other one by the
// service, which is the only place that can see it.
function IsOnOrAfter(property: string, options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isOnOrAfter',
      target: target.constructor,
      propertyName,
      constraints: [property],
      options: {
        message: `${propertyName} must be on or after ${property}`,
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[property];
          if (typeof value !== 'string' || typeof other !== 'string') {
            return true;
          }
          return isValidDiscountWindow(other, value);
        },
      },
    });
}

// The sale fields rooms and venues share. Create DTOs extend it, and
// PartialType carries the rules through to the update DTOs.
export class DiscountFieldsDto {
  // Capped below 100 so a typo cannot give a room away.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DISCOUNT_PERCENT)
  discountPercent?: number;

  // @IsOptional lets null through, which is how a PATCH clears a bound.
  // @Matches rejects a timestamp; @IsISO8601 strict rejects 31 February.
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'discountStartsAt must be YYYY-MM-DD' })
  @IsISO8601({ strict: true, strictSeparator: true })
  discountStartsAt?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'discountEndsAt must be YYYY-MM-DD' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @IsOnOrAfter('discountStartsAt')
  discountEndsAt?: string | null;
}
