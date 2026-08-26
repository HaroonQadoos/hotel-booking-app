// auth/dto/change-password.dto.ts
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  // No length rule: this is checked against the stored hash, not stored. A
  // MinLength here would reject — with a validation error rather than a 401 —
  // any account whose password predates the current rule.
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
