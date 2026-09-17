// src/mail/mail.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

// The Vite dev server's port — see vite.config.ts in hotel-booking-client.
// Not 3000: that is this API, which has no page to show a reset link on.
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const DEFAULT_FROM = '"Hotel Booking" <no-reply@hotel-booking.local>';

@Injectable()
export class MailService implements OnModuleInit {
  // Typed with the SMTP result shape so sendMail() returns SentMessageInfo
  // instead of any — getTestMessageUrl() needs the real type.
  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.from = this.config.get<string>('MAIL_FROM', DEFAULT_FROM);

    // MAIL_HOST is the switch: set it and mail goes out through a real SMTP
    // server; leave it unset and every message is captured by Ethereal, a
    // throwaway inbox that never delivers to the recipient. That keeps a
    // fresh checkout from needing credentials before it can boot, without
    // ever sending real mail by accident.
    const host = this.config.get<string>('MAIL_HOST');
    if (host) {
      await this.createSmtpTransport(host);
    } else {
      await this.createEtherealTransport();
    }
  }

  private async createSmtpTransport(host: string) {
    const port = Number(this.config.get<string>('MAIL_PORT', '587'));
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      // Port 465 is implicit TLS; 587 (and 25) start plain and upgrade via
      // STARTTLS, which nodemailer negotiates on its own when secure is false.
      secure:
        this.config.get<string>('MAIL_SECURE', String(port === 465)) === 'true',
      auth: user && pass ? { user, pass } : undefined,
    });

    // Bad credentials or a blocked port surface here, at startup, instead of
    // as a silent failure the first time a user asks for a reset. Logged, not
    // thrown: a mail outage should not keep the whole API from booting.
    try {
      await this.transporter.verify();
      this.logger.log(`SMTP transport ready (${host}:${port})`);
    } catch (err) {
      this.logger.error(
        `SMTP transport failed to verify (${host}:${port})`,
        err,
      );
    }
  }

  private async createEtherealTransport() {
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

    this.logger.warn(
      'MAIL_HOST is not set — using an Ethereal test inbox. Emails will NOT ' +
        'reach real recipients; each send logs a preview URL instead.',
    );
  }

  // Ethereal returns a preview link; a real SMTP server returns false, in
  // which case the message id is the only thing worth logging.
  private describeDelivery(info: SMTPTransport.SentMessageInfo): string {
    const preview = nodemailer.getTestMessageUrl(info);
    return preview ? `preview: ${preview}` : `id: ${info.messageId}`;
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
      from: this.from,
      to,
      subject: 'Verify your email',
      html: `<p>Click below to verify your account:</p><a href="${url}">${url}</a>`,
    });

    this.logger.log(
      `Verification email to ${to} — ${this.describeDelivery(info)}`,
    );
  }

  async sendPasswordResetEmail(to: string, rawToken: string) {
    // Points at the frontend, not at this API: the API has no view layer, and
    // a token in a URL this server handles would end up in its access logs.
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      DEFAULT_FRONTEND_URL,
    );
    const url = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Reset your password',
      html:
        `<p>Click below to choose a new password. The link expires shortly.</p>` +
        `<a href="${url}">${url}</a>` +
        `<p>If you didn't ask for this, you can ignore this email — ` +
        `your password will not change.</p>`,
    });

    // The token itself is deliberately not logged.
    this.logger.log(
      `Password reset email to ${to} — ${this.describeDelivery(info)}`,
    );
  }
}
