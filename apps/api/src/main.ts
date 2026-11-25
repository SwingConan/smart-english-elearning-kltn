import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureHttpApplication } from './app.setup';

async function bootstrap() {
  if (process.env.W07_ENABLED === 'QA_DEC071') {
    const guard = await import('../../../scripts/lib/w07-dec071-target.cjs');
    await guard.verify();
  } else if (process.env.W07_CF_RUN_INTENT) {
    const guard = await import('../../../scripts/lib/w07-cf-target.cjs');
    await guard.verify();
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  } else if (process.env.W07_ENABLED === 'DEV_DEC049') {
    const guard = await import('../../../scripts/lib/w07-target.cjs');
    await guard.verify();
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  } else if (process.env.W06_ENABLED === 'DEV_DEC047') {
    // Dynamic import only after both stages; no .env target fallback in a W06 run.
    const guard = await import('../../../scripts/lib/w06-target.cjs');
    await guard.verify();
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  }
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  const port = config.get<number>('PORT', 3000);

  app.enableShutdownHooks();
  configureHttpApplication(app, config);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart English E-Learning API')
    .setDescription('KLTN HK1 2026-2027')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Product DEV/UAT stays loopback-only. Starting still requires the separate
  // approved target/environment gates above; this is not runtime authorization.
  await app.listen(port, '127.0.0.1');
  console.log(`API running at http://localhost:${port}/api`);
  console.log(`Swagger running at http://localhost:${port}/docs`);
}

void bootstrap();
