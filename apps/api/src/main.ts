import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureHttpApplication } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const port = config.get<number>('PORT', 3000);

  configureHttpApplication(app, config);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart English E-Learning API')
    .setDescription('KLTN HK1 2026-2027')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  console.log(`API running at http://localhost:${port}/api`);
  console.log(`Swagger running at http://localhost:${port}/docs`);
}

void bootstrap();
