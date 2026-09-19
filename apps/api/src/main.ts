import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  const port = config.get<number>('PORT', 3000);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
