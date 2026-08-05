import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import * as express from 'express';
import { json, urlencoded } from 'express';
import { existsSync, mkdirSync } from 'fs';
import * as http from 'http';
import { config } from 'dotenv';
import { join } from 'path';
import { getUploadPath } from './common/utils/upload-path';

const envPath = [join(__dirname, '..', '.env'), join(__dirname, '..', '..', '.env')].find(existsSync);
if (envPath) config({ path: envPath });

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');

  const uploadsPath = getUploadPath();
  if (!existsSync(uploadsPath)) mkdirSync(uploadsPath, { recursive: true });
  app.use('/uploads', express.static(uploadsPath));

  app.use(
    json({
      limit: '50mb',
      verify: (req: http.IncomingMessage & { rawBody?: Buffer }, _res, buf: Buffer) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: 'Content-Disposition',
  });

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformInterceptor(reflector));

  const config = new DocumentBuilder()
    .setTitle('Mon API en NESTJS')
    .setDescription('The user management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const server = await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  server.setTimeout(300000);
}
void bootstrap();
