import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.APP_DATABASE_URL!,
  },
  entities: {
    roles: {
      provider: 'supabase',
    },
  },
  verbose: true,
  strict: true,
});
