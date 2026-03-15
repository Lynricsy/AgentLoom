import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import multipart from '@fastify/multipart';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import { Logger } from '@nestjs/common';

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
      files: 1,
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

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ZodValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('AgentLoom API')
    .setDescription('AgentLoom 多智能体协作平台 API')
    .setVersion('1.0')
    .setContact('AgentLoom', 'https://agentloom.dev', 'support@agentloom.dev')
    .setLicense('Proprietary', undefined)
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      'X-Api-Key',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  cleanupOpenApiDoc(document, { version: '3.0' });
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
