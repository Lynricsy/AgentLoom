ALTER TABLE "sandbox_sessions" ADD COLUMN "runtime_handle" varchar(128);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sandbox_sessions) THEN
    ALTER TABLE sandbox_sessions DROP COLUMN container_id;
  END IF;
END
$$;
