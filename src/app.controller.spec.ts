import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailService } from './mail/mail.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        // Stubbed rather than real: the live MailService opens an Ethereal
        // SMTP account on init.
        {
          provide: MailService,
          useValue: { sendVerificationEmail: jest.fn() },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello Haroon!"', () => {
      expect(appController.getHello()).toBe('Hello Haroon!');
    });
  });
});
