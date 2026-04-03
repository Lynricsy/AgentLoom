-- Follow-up backfill for historical persistent sandboxes that were only
-- auto-stopped by timeout but still carry a failed resource status.

WITH timed_out_persistent_sessions AS (
  SELECT DISTINCT s.id
  FROM sandbox_sessions s
  JOIN sandbox_logs l
    ON l.session_id = s.id
  WHERE s.status = 'failed'
    AND COALESCE(s.config->>'lifecycleMode', 'session') = 'persistent'
    AND l.level = 'system'
    AND l.message = 'Sandbox timed out'
)
UPDATE sandbox_sessions s
SET status = 'stopped'
FROM timed_out_persistent_sessions matched
WHERE s.id = matched.id;
