import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

// The subset of nodemailer's message options this service actually sets.
interface SentMail {
  from: string;
  to: string;
  subject: string;
  html: string;
}

describe('MailService', () => {
  let service: MailService;
  let sendMail: jest.Mock<Promise<{ messageId: string }>, [SentMail]>;
  let config: { get: jest.Mock<string | undefined, [string, string?]> };

  beforeEach(async () => {
    config = { get: jest.fn<string | undefined, [string, string?]>() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get<MailService>(MailService);

    // onModuleInit() would reach out to Ethereal for a real SMTP account, so
    // the transport is swapped in directly instead of being created.
    sendMail = jest
      .fn<Promise<{ messageId: string }>, [SentMail]>()
      .mockResolvedValue({ messageId: 'test-message-id' });
    (
      service as unknown as { transporter: { sendMail: typeof sendMail } }
    ).transporter = { sendMail };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendPasswordResetEmail', () => {
    it('sends to the address that asked for the reset', async () => {
      config.get.mockReturnValue('https://app.example.com');

      await service.sendPasswordResetEmail('guest@example.com', 'raw-token');

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].to).toBe('guest@example.com');
    });

    // The link has to point at the frontend form, not at this API — the API
    // never renders a page, and a token in a URL this server handles would
    // land in its access logs.
    it('builds the link from FRONTEND_URL', async () => {
      config.get.mockReturnValue('https://app.example.com');

      await service.sendPasswordResetEmail('guest@example.com', 'raw-token');

      expect(config.get).toHaveBeenCalledWith(
        'FRONTEND_URL',
        expect.any(String),
      );
      expect(sendMail.mock.calls[0][0].html).toContain(
        'https://app.example.com/reset-password?token=raw-token',
      );
    });

    it('falls back to a local frontend when FRONTEND_URL is unset', async () => {
      config.get.mockImplementation(
        (_key: string, fallback?: string) => fallback,
      );

      await service.sendPasswordResetEmail('guest@example.com', 'raw-token');

      expect(sendMail.mock.calls[0][0].html).toContain(
        'http://localhost:3000/reset-password?token=raw-token',
      );
    });

    // Hex tokens need no escaping, but the encoding is what keeps the link
    // correct if the token format ever changes to something base64-shaped.
    it('url-encodes the token', async () => {
      config.get.mockReturnValue('https://app.example.com');

      await service.sendPasswordResetEmail('guest@example.com', 'a+b/c=d');

      expect(sendMail.mock.calls[0][0].html).toContain('token=a%2Bb%2Fc%3Dd');
    });
  });
});
