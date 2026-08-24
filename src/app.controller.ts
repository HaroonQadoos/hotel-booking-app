import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MailService } from './mail/mail.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private readonly mailService: MailService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('test-email')
  async testEmail() {
    await this.mailService.sendVerificationEmail('test@example.com', 'fake-token-123');
    return { message: 'Check your terminal for the preview link' };
  }
}
