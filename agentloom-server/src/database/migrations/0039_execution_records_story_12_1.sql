DROP POLICY IF EXISTS "agent_execution_records_select_policy" ON "agent_execution_records";
DROP POLICY IF EXISTS "agent_execution_records_insert_policy" ON "agent_execution_records";
DROP POLICY IF EXISTS "agent_execution_records_update_policy" ON "agent_execution_records";
DROP POLICY IF EXISTS "agent_execution_records_delete_policy" ON "agent_execution_records";

ALTER TABLE "agent_execution_records"
  ADD COLUMN "tenant_id" uuid,
  ADD COLUMN "telemetry_data" jsonb,
  ADD COLUMN "summary_data" jsonb;

UPDATE "agent_execution_records" AS "aer"
SET
  "tenant_id" = "we"."tenant_id",
  "telemetry_data" = CASE
    WHEN "aer"."record_type" = 'step_telemetry' THEN "aer"."data"
    ELSE NULL
  END,
  "summary_data" = CASE
    WHEN "aer"."record_type" = 'execution_summary' THEN "aer"."data"
    ELSE NULL
  END
FROM "workflow_executions" AS "we"
WHERE "we"."id" = "aer"."execution_id";

ALTER TABLE "agent_execution_records"
  ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "agent_execution_records"
  DROP COLUMN "data";

ALTER TABLE "agent_execution_records"
  ADD CONSTRAINT "agent_execution_records_payload_check"
  CHECK (
    (
      "record_type" = 'step_telemetry'
      AND "telemetry_data" IS NOT NULL
      AND "summary_data" IS NULL
    )
    OR
    (
      "record_type" = 'execution_summary'
      AND "summary_data" IS NOT NULL
      AND "telemetry_data" IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS "idx_execution_records_tenant_id"
  ON "agent_execution_records" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_execution_records_tenant_execution_id"
  ON "agent_execution_records" USING btree ("tenant_id", "execution_id");

CREATE POLICY "agent_execution_records_select_policy"
  ON "agent_execution_records"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (tenant_id = get_tenant_id());

CREATE POLICY "agent_execution_records_insert_policy"
  ON "agent_execution_records"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "agent_execution_records_update_policy"
  ON "agent_execution_records"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "agent_execution_records_delete_policy"
  ON "agent_execution_records"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING (tenant_id = get_tenant_id());
