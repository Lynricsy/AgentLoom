import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type SwaggerDocumentOptions,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export const API_GLOBAL_PREFIX = 'api/v1';
export const SWAGGER_DOCUMENT_PATH = 'docs';
export const SWAGGER_JSON_DOCUMENT_URL = 'openapi.json';

const swaggerDocumentOptions: SwaggerDocumentOptions = {
  deepScanRoutes: true,
  operationIdFactory: (controllerKey: string, methodKey: string) => {
    const normalizedControllerKey = controllerKey.replace(/Controller$/, '');
    return `${normalizedControllerKey}_${methodKey}`;
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-zA-Z0-9])/g, (_, character: string) =>
    character.toUpperCase(),
  );
}

function normalizeSchemaPropertyAliases(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeSchemaPropertyAliases(item);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const properties = value.properties;
  if (isRecord(properties)) {
    const aliasesToRemove: string[] = [];

    for (const propertyName of Object.keys(properties)) {
      if (!propertyName.includes('_')) {
        continue;
      }

      const camelCaseName = toCamelCase(propertyName);
      if (camelCaseName !== propertyName && camelCaseName in properties) {
        aliasesToRemove.push(propertyName);
      }
    }

    for (const aliasName of aliasesToRemove) {
      const canonicalName = toCamelCase(aliasName);
      delete properties[aliasName];

      if (Array.isArray(value.required)) {
        value.required = Array.from(
          new Set(
            value.required.map((requiredProperty) =>
              requiredProperty === aliasName ? canonicalName : requiredProperty,
            ),
          ),
        );
      }
    }
  }

  for (const nestedValue of Object.values(value)) {
    normalizeSchemaPropertyAliases(nestedValue);
  }
}

function normalizeOperationParameterAliases(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeOperationParameterAliases(item);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const parameters = value.parameters;
  if (Array.isArray(parameters)) {
    const canonicalParameters = new Map<string, Record<string, unknown>>();
    const aliasesToRemove = new Set<number>();

    parameters.forEach((parameter, index) => {
      if (!isRecord(parameter)) {
        return;
      }

      const name = parameter.name;
      const location = parameter.in;
      if (typeof name !== 'string' || typeof location !== 'string') {
        return;
      }

      const canonicalName = toCamelCase(name);
      const canonicalKey = `${location}:${canonicalName}`;

      if (!name.includes('_')) {
        canonicalParameters.set(canonicalKey, parameter);
        return;
      }

      const targetParameter = canonicalParameters.get(canonicalKey);
      if (!targetParameter) {
        return;
      }

      if (parameter.required === true) {
        targetParameter.required = true;
      }

      aliasesToRemove.add(index);
    });

    if (aliasesToRemove.size > 0) {
      value.parameters = parameters.filter((_, index) => !aliasesToRemove.has(index));
    }
  }

  for (const nestedValue of Object.values(value)) {
    normalizeOperationParameterAliases(nestedValue);
  }
}

function normalizeOpenApiKeywords(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeOpenApiKeywords(item);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if ('const' in value) {
    const constValue = value.const;
    if (constValue !== undefined && !('enum' in value)) {
      value.enum = [constValue];
    }
    delete value.const;
  }

  if ('propertyNames' in value) {
    delete value.propertyNames;
  }

  for (const nestedValue of Object.values(value)) {
    normalizeOpenApiKeywords(nestedValue);
  }
}

function normalizeOpenApiInfo(document: OpenAPIObject): void {
  const info = document.info as OpenAPIObject['info'] & {
    license?: { name?: string; url?: string };
  };

  if (!info.license) {
    return;
  }

  if (info.license.url === '') {
    delete info.license.url;
  }

  if (!info.license.name && !info.license.url) {
    delete info.license;
  }
}

function normalizeOpenApiServers(document: OpenAPIObject): void {
  if (Array.isArray(document.servers) && document.servers.length > 0) {
    return;
  }

  document.servers = [{ url: `/${API_GLOBAL_PREFIX}`, description: 'API v1' }];
}

function normalizeOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  normalizeOpenApiKeywords(document);
  normalizeSchemaPropertyAliases(document);
  normalizeOperationParameterAliases(document);
  normalizeOpenApiInfo(document);
  normalizeOpenApiServers(document);
  return document;
}

function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('AgentLoom API')
    .setDescription('AgentLoom 多智能体协作平台 API')
    .setVersion('1.0')
    .setContact('AgentLoom', 'https://agentloom.dev', 'support@agentloom.dev')
    .setLicense('Proprietary', '')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      'X-Api-Key',
    )
    .addServer(`/${API_GLOBAL_PREFIX}`, 'API v1')
    .build();
}

export function createSwaggerDocument(
  app: INestApplication,
): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    buildSwaggerConfig(),
    swaggerDocumentOptions,
  );

  return normalizeOpenApiDocument(
    cleanupOpenApiDoc(document, { version: '3.0' }),
  );
}
