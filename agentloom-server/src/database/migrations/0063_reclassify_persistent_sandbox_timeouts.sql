-- Persistent sandbox timeout is a resource auto-stop, not a resource failure.
-- Reclassify historical timeouted persistent sandboxes from failed -> stopped,
-- but keep true creation/runtime failures untouched.

UPDATE "sandbox_sessions" AS "sessions"
SET "status" = 'stopped'
WHERE "sessions"."status" = 'failed'
  AND COALESCE("sessions"."config"->>'lifecycleMode', 'session') = 'persistent'
  AND EXISTS (
    SELECT 1
    FROM "sandbox_logs" AS "logs"
    WHERE "logs"."session_id" = "sessions"."id"
      AND "logs"."level" = 'system'
      AND "logs"."message" = 'Sandbox timed out'
  );
