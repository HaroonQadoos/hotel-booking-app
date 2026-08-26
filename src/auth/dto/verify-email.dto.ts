// auth/dto/verify-email.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

// A DTO rather than a bare @Query('token') param, so the global ValidationPipe
// rejects a missing or empty token with a 400 before it reaches the service.
export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
