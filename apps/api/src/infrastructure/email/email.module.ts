import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailMessage, EmailSender } from './email-sender';

class SmtpEmailSender extends EmailSender {
  constructor(
    private readonly transporter: nodemailer.Transporter,
    private readonly from: string,
  ) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

class ConsoleEmailSender extends EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async send(_message: EmailMessage): Promise<void> {
    this.logger.log('Development email accepted; recipient and content suppressed');
  }
}

function required(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) throw new Error(`${key} is required for SMTP email delivery`);
  return value;
}

export function createEmailSender(config: ConfigService): EmailSender {
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const provider = config.get<string>('EMAIL_PROVIDER', 'console').trim().toLowerCase();

  if (provider !== 'smtp') {
    if (isProduction) {
      throw new Error('EMAIL_PROVIDER=smtp is required in production');
    }
    if (provider !== 'console') {
      throw new Error('EMAIL_PROVIDER must be console or smtp');
    }
    return new ConsoleEmailSender();
  }

  const host = required(config, 'SMTP_HOST');
  const from = required(config, 'EMAIL_FROM');
  const fromAddress = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) {
    throw new Error('EMAIL_FROM must contain a valid email address');
  }
  if (/\s/.test(host)) {
    throw new Error('SMTP_HOST must not contain whitespace');
  }
  const portText = required(config, 'SMTP_PORT');
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535');
  }

  const secureText = config.get<string>('SMTP_SECURE', 'false').trim().toLowerCase();
  if (secureText !== 'true' && secureText !== 'false') {
    throw new Error('SMTP_SECURE must be true or false');
  }

  const user = config.get<string>('SMTP_USER')?.trim();
  const password = config.get<string>('SMTP_PASSWORD');
  if (Boolean(user) !== Boolean(password)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together');
  }

  return new SmtpEmailSender(
    nodemailer.createTransport({
      host,
      port,
      secure: secureText === 'true',
      ...(user && password ? { auth: { user, pass: password } } : {}),
    }),
    from,
  );
}

@Global()
@Module({
  providers: [
    {
      provide: EmailSender,
      inject: [ConfigService],
      useFactory: createEmailSender,
    },
  ],
  exports: [EmailSender],
})
export class EmailModule {}
