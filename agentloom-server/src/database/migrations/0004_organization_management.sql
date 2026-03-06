-- 组织管理模块迁移: 枚举类型、组织表、成员表、邀请表、用户FK、JWT Hook
DO $$ BEGIN
  CREATE TYPE "org_role" AS ENUM('owner', 'admin', 'creator', 'operator', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "invitation_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"tenant_id" uuid DEFAULT uuid_generate_v7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"description" varchar(500),
	"settings" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'viewer' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "org_role" DEFAULT 'viewer' NOT NULL,
	"token" varchar(255) NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_members_org_user" ON "organization_members" USING btree ("organization_id", "user_id");
--> statement-breakpoint
CREATE INDEX "idx_org_members_user_id" ON "organization_members" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_slug" ON "organizations" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_invitations_token" ON "organization_invitations" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "idx_org_invitations_email" ON "organization_invitations" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_invitations_org_email_pending"
  ON "organization_invitations" ("organization_id", "email")
  WHERE "status" = 'pending';
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "org_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "org_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "org_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "org_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "org_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_current_organization_id_organizations_id_fk" FOREIGN KEY ("current_organization_id") REFERENCES "organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON "organizations"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_organization_invitations_updated_at
  BEFORE UPDATE ON "organization_invitations"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_tenant_id uuid;
  v_tenant_role text;
BEGIN
  claims := event->'claims';

  -- 查询用户当前组织的租户信息
  BEGIN
    SELECT o.tenant_id, om.role
    INTO v_tenant_id, v_tenant_role
    FROM public.users u
    JOIN public.organizations o ON o.id = u.current_organization_id
    JOIN public.organization_members om ON om.organization_id = o.id AND om.user_id = u.id
    WHERE u.supabase_user_id = (event->>'user_id')::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      -- fail-open: 查询失败时不注入租户信息，但不阻止登录
      v_tenant_id := NULL;
      v_tenant_role := NULL;
  END;

  -- 始终写入 claims（有值写值，无值写 null）
  claims := jsonb_set(claims, '{tenant_id}', COALESCE(to_jsonb(v_tenant_id::text), 'null'::jsonb));
  claims := jsonb_set(claims, '{tenant_role}', COALESCE(to_jsonb(v_tenant_role), 'null'::jsonb));
  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
--> statement-breakpoint
GRANT SELECT ON TABLE public.users TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON TABLE public.organizations TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON TABLE public.organization_members TO supabase_auth_admin;
