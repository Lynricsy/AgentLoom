import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import multipart from '@fastify/multipart';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import { Logger } from '@nestjs/common';
import {
  API_GLOBAL_PREFIX,
  createSwaggerDocument,
  SWAGGER_DOCUMENT_PATH,
  SWAGGER_JSON_DOCUMENT_URL,
} from './openapi/swagger-document';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
    { rawBody: true },
  );

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 50,
    },
  });

  // Socket.IO Redis adapter — 多实例部署时跨进程广播
  const redisIoAdapter = RedisIoAdapter.create(app);
  try {
    await redisIoAdapter.connectToRedis();
  } catch (err) {
    logger.warn(
      `Redis IO adapter connection failed, falling back to single-instance mode: ${(err as Error).message}`,
    );
  }
  app.useWebSocketAdapter(redisIoAdapter);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ZodValidationPipe());

  const document = createSwaggerDocument(app);
  SwaggerModule.setup(SWAGGER_DOCUMENT_PATH, app, document, {
    jsonDocumentUrl: SWAGGER_JSON_DOCUMENT_URL,
  });

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
