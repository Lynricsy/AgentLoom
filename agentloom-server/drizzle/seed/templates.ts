import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../../src/database/schema';
import { seedTemplates } from '../../src/database/seeds/template-seeds';

async function main() {
  const databaseUrl = process.env.APP_DATABASE_URL;
  if (!databaseUrl) {
    console.error('APP_DATABASE_URL is required. Set it in .env or environment.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });

  console.log('Seeding workflow templates...');
  await seedTemplates(db);
  console.log('Done — %d templates seeded.', 5);

  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
