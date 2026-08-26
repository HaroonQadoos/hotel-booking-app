// src/mail/mail.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class MailService implements OnModuleInit {
  // Typed with the SMTP result shape so sendMail() returns SentMessageInfo
  // instead of any — getTestMessageUrl() needs the real type.
  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

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

    this.logger.log(
      'Ethereal test account ready — emails will log a preview URL',
    );
  }

  async sendVerificationEmail(to: string, token: string) {
    // Built from config, not hard-coded: the link has to point at wherever this
    // app is actually reachable, which differs between local dev and deploys.
    const baseUrl = this.config.get<string>(
      'APP_URL',
      `http://localhost:${this.config.get<string>('PORT') ?? 3000}`,
    );
    const url = `${baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;

    const info = await this.transporter.sendMail({
      from: '"My App" <no-reply@myapp.com>',
      to,
      subject: 'Verify your email',
      html: `<p>Click below to verify your account:</p><a href="${url}">${url}</a>`,
    });

    this.logger.log(
      `Verification email to ${to} — preview: ${nodemailer.getTestMessageUrl(info)}`,
    );
  }
}
