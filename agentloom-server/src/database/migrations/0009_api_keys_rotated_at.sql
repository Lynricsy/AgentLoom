ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "rotated_at" timestamp with time zone;
