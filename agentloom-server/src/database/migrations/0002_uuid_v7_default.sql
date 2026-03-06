CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$
  SELECT encode(
    substring(int8send(floor(t_ms)::int8) FROM 3) ||
    int2send((7 << 12)::int2 | ((t_ms - floor(t_ms)) * 4096)::int2) ||
    substring(uuid_send(gen_random_uuid()) FROM 9 FOR 8),
    'hex'
  )::uuid
  FROM (SELECT extract(epoch FROM clock_timestamp()) * 1000 AS t_ms) s;
$$;
--> statement-breakpoint
ALTER TABLE "users"
  ALTER COLUMN "id" SET DEFAULT uuid_generate_v7();
