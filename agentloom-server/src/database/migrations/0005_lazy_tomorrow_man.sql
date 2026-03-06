-- Custom migration: RLS (Row Level Security) multi-tenant data isolation
-- Depends on: 0004_organization_management.sql (tables already exist)
-- This migration adds:
--   1. get_tenant_id() helper function
--   2. ENABLE ROW LEVEL SECURITY on all tenant-scoped tables
--   3. Per-table RLS policies for CRUD operations
--   4. FORCE ROW LEVEL SECURITY (applies even to table owners)

-- Step 1: Create get_tenant_id() function
-- STABLE: won't modify data, safe for RLS. NULLIF: treats empty string as NULL.
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$;--> statement-breakpoint

-- Step 2: Enable RLS on all tenant-scoped tables
ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Step 3: Organization policies (direct tenant_id match)
CREATE POLICY "organizations_select_policy" ON "organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "organizations_insert_policy" ON "organizations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "organizations_update_policy" ON "organizations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "organizations_delete_policy" ON "organizations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint

-- Step 4: Organization members policies (JOIN through organizations)
CREATE POLICY "organization_members_select_policy" ON "organization_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_members"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "organization_members_insert_policy" ON "organization_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_members"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "organization_members_update_policy" ON "organization_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_members"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_members"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "organization_members_delete_policy" ON "organization_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_members"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint

-- Step 5: Organization invitations policies (JOIN through organizations)
CREATE POLICY "organization_invitations_select_policy" ON "organization_invitations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_invitations"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "organization_invitations_insert_policy" ON "organization_invitations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_invitations"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "organization_invitations_update_policy" ON "organization_invitations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_invitations"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_invitations"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "organization_invitations_delete_policy" ON "organization_invitations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "organizations"."id" = "organization_invitations"."organization_id"
    AND "organizations".tenant_id = get_tenant_id()
  ));--> statement-breakpoint

-- Step 6: Force RLS even for table owners (critical for security)
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_invitations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Step 7: Grant authenticated role permissions on tables
-- (Supabase 'authenticated' role needs explicit table access for RLS to work)
GRANT SELECT, INSERT, UPDATE, DELETE ON "organizations" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_members" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_invitations" TO "authenticated";
