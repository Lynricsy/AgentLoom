import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function resolveCompiledModulePath(candidates, label) {
  const resolvedPath = candidates.find((candidate) => existsSync(candidate));

  if (!resolvedPath) {
    throw new Error(
      `${label} was not found in any expected build output path:\n${candidates.join('\n')}`,
    );
  }

  return resolvedPath;
}

function applyExportEnvDefaults() {
  process.env.APP_PORT ??= '3000';
  process.env.APP_NODE_ENV ??= 'development';
  process.env.APP_DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/agentloom';
  process.env.APP_SUPABASE_URL ??= 'http://127.0.0.1:54321';
  process.env.APP_SUPABASE_ANON_KEY ??= 'agentloom-openapi-export-anon-key';
  process.env.APP_SUPABASE_SERVICE_KEY ??=
    'agentloom-openapi-export-service-key';
  process.env.APP_JWT_SECRET ??= 'agentloom-openapi-export-secret';
  process.env.APP_REDIS_URL ??= 'redis://127.0.0.1:6379/0';
  process.env.APP_MASTER_ENCRYPTION_KEY ??=
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.APP_OAUTH_REDIRECT_URL ??=
    'http://127.0.0.1:5173/auth/callback';
  process.env.APP_FRONTEND_URL ??= 'http://127.0.0.1:5173';
}

async function loadCompiledModules() {
  const distAppModulePath = resolveCompiledModulePath(
    [
      join(projectRoot, 'dist', 'app.module.js'),
      join(projectRoot, 'dist', 'src', 'app.module.js'),
    ],
    'Compiled AppModule',
  );
  const distSwaggerDocumentPath = resolveCompiledModulePath(
    [
      join(projectRoot, 'dist', 'openapi', 'swagger-document.js'),
      join(projectRoot, 'dist', 'src', 'openapi', 'swagger-document.js'),
    ],
    'Compiled Swagger document helper',
  );

  const [nestjsCore, nestjsFastify, appModule, swaggerDocument] =
    await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/platform-fastify'),
      import(pathToFileURL(distAppModulePath).href),
      import(pathToFileURL(distSwaggerDocumentPath).href),
    ]);

  return {
    NestFactory: nestjsCore.NestFactory,
    FastifyAdapter: nestjsFastify.FastifyAdapter,
    AppModule: appModule.AppModule,
    createSwaggerDocument: swaggerDocument.createSwaggerDocument,
    API_GLOBAL_PREFIX: swaggerDocument.API_GLOBAL_PREFIX,
  };
}

/**
 * Nest 的通配路由（如 `:id/workspace/files/*`）在 swagger 文档里会把 URL 模板
 * 渲染成 `{path}`，但参数名沿用 `@Param('*')` 的 `*`，导致 spec 自相矛盾：
 * 模板声明的路径参数没有对应定义，OpenAPI 校验直接失败。
 *
 * 只重命名确认为通配参数（`name === '*'`）且模板恰好缺少一个路径参数的情况；
 * 其他不匹配一律保留原样，让普通路由缺失 decorator 的真实缺陷继续暴露。
 */
function normalizeWildcardPathParameters(document) {
  for (const [route, operations] of Object.entries(document.paths ?? {})) {
    const templateNames = [...route.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    );

    for (const operation of Object.values(operations ?? {})) {
      if (!operation || typeof operation !== 'object') continue;
      const parameters = operation.parameters;
      if (!Array.isArray(parameters)) continue;

      const pathParameters = parameters.filter(
        (parameter) => parameter?.in === 'path',
      );
      const wildcardParameters = pathParameters.filter(
        (parameter) => parameter.name === '*',
      );
      if (wildcardParameters.length !== 1) continue;

      const declaredNames = new Set(
        pathParameters.map((parameter) => parameter.name),
      );
      const missingNames = templateNames.filter(
        (name) => !declaredNames.has(name),
      );
      if (missingNames.length !== 1) continue;

      wildcardParameters[0].name = missingNames[0];
    }
  }

  return document;
}

/**
 * Zod 的 `z.tuple([...])` 会被渲染成 JSON Schema 2020-12 的 `prefixItems`，
 * 而 OpenAPI 3.0 完全没有定长元组这个概念，`prefixItems` 属于未知关键字、
 * 同时又缺少必需的 `items`，openapi-generator 的 spec 校验会直接失败。
 *
 * 这里按 OpenAPI 3.0 能表达的最接近形式降级：`items` 取各位置 schema
 * （形状一致时取其一，否则用 anyOf），并用 minItems/maxItems 保留长度约束。
 * 元组的"第 N 位是什么类型"信息在 3.0 里无法表达，只能丢失。
 */
function downgradeTupleSchemas(node) {
  if (Array.isArray(node)) {
    for (const item of node) downgradeTupleSchemas(item);
    return node;
  }

  if (!node || typeof node !== 'object') return node;

  for (const value of Object.values(node)) downgradeTupleSchemas(value);

  const prefixItems = node.prefixItems;
  if (!Array.isArray(prefixItems)) return node;

  delete node.prefixItems;

  if (node.items === undefined) {
    const serialized = prefixItems.map((item) => JSON.stringify(item));
    const uniqueIndexes = serialized
      .map((item, index) => (serialized.indexOf(item) === index ? index : -1))
      .filter((index) => index >= 0);

    node.items =
      uniqueIndexes.length === 1
        ? prefixItems[uniqueIndexes[0]]
        : { anyOf: uniqueIndexes.map((index) => prefixItems[index]) };
  }

  node.minItems ??= prefixItems.length;
  node.maxItems ??= prefixItems.length;

  return node;
}

async function exportSpec() {
  applyExportEnvDefaults();

  const {
    NestFactory,
    FastifyAdapter,
    AppModule,
    createSwaggerDocument,
    API_GLOBAL_PREFIX,
  } = await loadCompiledModules();

  const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
    logger: false,
  });

  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  const document = downgradeTupleSchemas(
    normalizeWildcardPathParameters(createSwaggerDocument(app)),
  );
  const outputDir = join(projectRoot, 'sdk');
  const outputPath = join(outputDir, 'openapi.json');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  console.log(`OpenAPI spec exported to ${outputPath}`);
  console.log(`Endpoints: ${Object.keys(document.paths ?? {}).length} paths`);

  await app.close();
  process.exit(0);
}

exportSpec().catch((error) => {
  console.error('Failed to export OpenAPI spec:', error);
  process.exit(1);
});
