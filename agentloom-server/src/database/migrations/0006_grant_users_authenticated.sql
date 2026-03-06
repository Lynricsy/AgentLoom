-- Grant authenticated role access to users table
-- Required for tenant-scoped operations (e.g., invite member lookup, member removal)
-- that access users within SET LOCAL ROLE authenticated transactions
GRANT SELECT, UPDATE ON "users" TO "authenticated";
