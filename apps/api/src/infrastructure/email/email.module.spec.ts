import { ConfigService } from '@nestjs/config';
import { createEmailSender } from './email.module';

describe('email configuration', () => {
  it('refuses console delivery in production', () => {
    expect(() =>
      createEmailSender(new ConfigService({ NODE_ENV: 'production', EMAIL_PROVIDER: 'console' })),
    ).toThrow('EMAIL_PROVIDER=smtp is required in production');
  });

  it('fails fast when production SMTP configuration is incomplete', () => {
    expect(() =>
      createEmailSender(new ConfigService({ NODE_ENV: 'production', EMAIL_PROVIDER: 'smtp' })),
    ).toThrow('SMTP_HOST is required');
  });

  it('allows the sanitized console sender outside production', () => {
    expect(
      createEmailSender(new ConfigService({ NODE_ENV: 'test', EMAIL_PROVIDER: 'console' })),
    ).toBeDefined();
  });

  it('rejects an invalid SMTP sender address at startup', () => {
    expect(() =>
      createEmailSender(
        new ConfigService({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: 'smtp',
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          EMAIL_FROM: 'not-an-email',
        }),
      ),
    ).toThrow('EMAIL_FROM must contain a valid email address');
  });
});
