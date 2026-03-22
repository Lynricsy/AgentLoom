import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../src/database/schema';
import {
  ROUTING_BENCHMARK_SEED_BLUEPRINTS,
  ROUTING_BENCHMARK_SUPPORTED_PROVIDERS,
} from '../src/database/seeds/routing-benchmarks.seed';

async function main() {
  const databaseUrl = process.env.APP_DATABASE_URL;
  if (!databaseUrl) {
    console.error('APP_DATABASE_URL is required.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  try {
    const db = drizzle(sql, { schema });

    const routerModelRows = await db
      .select({ id: schema.routerModels.id })
      .from(schema.routerModels);

    if (routerModelRows.length === 0) {
      console.warn(
        'No router_models rows found. Create tenant-scoped router model records before verifying benchmarks.',
      );
      return;
    }

    const benchmarkRows = await db
      .select({
        taskCategory: schema.routingBenchmarks.taskCategory,
        providerId: schema.llmModelConfigs.provider,
        modelName: schema.llmModelConfigs.modelName,
      })
      .from(schema.routingBenchmarks)
      .innerJoin(
        schema.routerModels,
        eq(schema.routingBenchmarks.modelId, schema.routerModels.id),
      )
      .innerJoin(
        schema.llmModelConfigs,
        eq(schema.routerModels.modelId, schema.llmModelConfigs.id),
      );

    if (benchmarkRows.length === 0) {
      console.error('No routing benchmark rows found.');
      process.exit(1);
    }

    const categoryCounts = new Map<string, number>();
    const providers = new Set<string>();

    for (const row of benchmarkRows) {
      categoryCounts.set(
        row.taskCategory,
        (categoryCounts.get(row.taskCategory) ?? 0) + 1,
      );
      providers.add(row.providerId);
    }

    const missingCategories = schema.ROUTING_BENCHMARK_TASK_CATEGORIES.filter(
      (category) => !categoryCounts.has(category) || (categoryCounts.get(category) ?? 0) < 10,
    );
    const missingProviders = ROUTING_BENCHMARK_SUPPORTED_PROVIDERS.filter(
      (providerId) => !providers.has(providerId),
    );

    console.log('Routing benchmark rows: %d', benchmarkRows.length);
    console.log('Expected blueprint count: %d', ROUTING_BENCHMARK_SEED_BLUEPRINTS.length);
    console.log('Per-category counts:');
    for (const category of schema.ROUTING_BENCHMARK_TASK_CATEGORIES) {
      console.log('  %s: %d', category, categoryCounts.get(category) ?? 0);
    }
    console.log('Provider coverage: %s', [...providers].sort().join(', '));

    if (missingCategories.length > 0 || missingProviders.length > 0) {
      if (missingCategories.length > 0) {
        console.error(
          'Missing or insufficient routing benchmark categories: %s',
          missingCategories.join(', '),
        );
      }
      if (missingProviders.length > 0) {
        console.error(
          'Missing provider coverage in routing benchmarks: %s',
          missingProviders.join(', '),
        );
      }
      process.exit(1);
    }

    console.log('Routing benchmark verification passed.');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error('Routing benchmark verification failed:', error);
  process.exit(1);
});
