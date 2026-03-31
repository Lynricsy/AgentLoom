-- Purge stale session-mode sandbox records that accumulated before the
-- hard-delete fix.  Persistent sandboxes are left untouched.
-- sandbox_logs rows are cascade-deleted via FK (onDelete: cascade).

DELETE FROM "sandbox_sessions"
WHERE "status" IN ('stopped', 'failed')
  AND (
    "config"->>'lifecycleMode' IS NULL
    OR "config"->>'lifecycleMode' = 'session'
  );
