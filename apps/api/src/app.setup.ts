import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { isIP } from 'node:net';

const TRUSTED_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);

export function configureHttpApplication(app: NestExpressApplication, config: ConfigService): void {
  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');

  app.set('trust proxy', parseTrustedProxies(config.get<string>('TRUST_PROXY')));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

export function parseTrustedProxies(value: string | undefined): false | string[] {
  if (!value?.trim()) return false;

  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => !entry || !isSafeProxyEntry(entry))) {
    throw new Error(
      'TRUST_PROXY must be a comma-separated allowlist of proxy IPs, CIDRs, or safe names',
    );
  }

  return entries;
}

function isSafeProxyEntry(entry: string): boolean {
  if (TRUSTED_PROXY_NAMES.has(entry)) return true;
  if (isIP(entry) !== 0) return true;

  const separator = entry.lastIndexOf('/');
  if (separator < 1) return false;

  const address = entry.slice(0, separator);
  const prefixText = entry.slice(separator + 1);
  const family = isIP(address);
  const prefix = Number(prefixText);
  const maximum = family === 4 ? 32 : family === 6 ? 128 : 0;

  return /^\d+$/.test(prefixText) && prefix > 0 && prefix <= maximum;
}
