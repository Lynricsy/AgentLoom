import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../../src/database/schema';
import { seedRoutingBenchmarks } from '../../src/database/seeds/routing-benchmarks.seed';
import { seedTemplates } from '../../src/database/seeds/template-seeds';
import { seedSkills } from '../../src/database/seeds/skill-seeds';
import { seedLlmProviders } from '../../src/database/seeds/provider-seeds';

async function main() {
  const databaseUrl = process.env.APP_DATABASE_URL;
  if (!databaseUrl) {
    console.error('APP_DATABASE_URL is required in the environment.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });

  console.log('Seeding LLM providers...');
  await seedLlmProviders(db);
  console.log('Done — 24 built-in LLM providers seeded.');

  console.log('Seeding workflow templates...');
  await seedTemplates(db);
  console.log('Done — %d templates seeded.', 5);

  console.log('Seeding routing benchmarks...');
  const routingBenchmarkResult = await seedRoutingBenchmarks(db);
  console.log(
    'Done — %d routing benchmark rows synchronized across %d router models.',
    routingBenchmarkResult.synchronizedCount,
    routingBenchmarkResult.matchedRouterModelCount,
  );
  if (routingBenchmarkResult.unmatchedModelKeys.length > 0) {
    console.warn(
      'Skipped unmatched routing benchmark targets: %s',
      routingBenchmarkResult.unmatchedModelKeys.join(', '),
    );
  }

  console.log('Seeding skills...');
  const seededSkillCount = await seedSkills(db);
  console.log('Done — %d skills seeded.', seededSkillCount);

  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
