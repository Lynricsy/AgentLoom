/**
 * 导出 OpenAPI spec 到 sdk/openapi.json
 * 用法: npx tsx scripts/export-openapi-spec.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from '../src/app.module';

async function exportSpec() {
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
    logger: false,
  });

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('AgentLoom API')
    .setDescription('AgentLoom multi-agent workflow orchestration platform API')
    .setVersion('1.0.0')
    .setContact('AgentLoom', 'https://agentloom.dev', 'support@agentloom.dev')
    .setLicense('Proprietary', undefined)
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      'X-Api-Key',
    )
    .addServer('/api/v1', 'API v1')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  cleanupOpenApiDoc(document, { version: '3.0' });

  const outputDir = join(__dirname, '..', 'sdk');
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  console.log(`OpenAPI spec exported to ${outputPath}`);
  console.log(`Endpoints: ${Object.keys(document.paths || {}).length} paths`);

  await app.close();
}

exportSpec().catch((err) => {
  console.error('Failed to export OpenAPI spec:', err);
  process.exit(1);
});
