// auth/dto/reset-password.dto.ts
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  // Same floor as RegisterDto — a reset must not be a way around the rule
  // that applies at sign-up.
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
