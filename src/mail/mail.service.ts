// src/mail/mail.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  async onModuleInit() {
    // generates a free, temporary SMTP inbox — no signup, no API key
    const testAccount = await nodemailer.createTestAccount();

    this.transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    this.logger.log('Ethereal test account ready — emails will log a preview URL');
  }

  async sendVerificationEmail(to: string, token: string) {
    const url = `${process.env.APP_URL}/auth/verify-email?token=${token}`;

    const info = await this.transporter.sendMail({
      from: '"My App" <no-reply@myapp.com>',
      to,
      subject: 'Verify your email',
      html: `<p>Click below to verify your account:</p><a href="${url}">${url}</a>`,
    });

    this.logger.log(`Verification email preview: ${nodemailer.getTestMessageUrl(info)}`);
  }
}