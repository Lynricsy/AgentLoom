-- ADR-0007：v1 AppSpec 与 v1 generation_plan 的类型已从代码中删除，存量 v1 数据清空。
-- 0089 已关闭 v1 应用的公开分享并把 readiness 置为 blocked；下一次生成运行由 Gate 0 重新生成 v2 规格，
-- 各 Gate 重新写入 v2 计划。只清 v1 的那一列，不碰已有的 v2 规格。
UPDATE "generated_apps"
SET
  "app_spec" = NULL,
  "generation_plan" = NULL,
  "updated_at" = now()
WHERE "app_spec"->>'version' = '1';--> statement-breakpoint
UPDATE "generated_apps"
SET
  "generation_plan" = NULL,
  "updated_at" = now()
WHERE "generation_plan"->>'planVersion' = '1';
