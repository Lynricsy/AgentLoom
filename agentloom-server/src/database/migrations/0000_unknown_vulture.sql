CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supabase_user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(100),
	"avatar_url" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"current_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_supabase_user_id_unique" UNIQUE("supabase_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_supabase_user_id_users_id_fk" FOREIGN KEY ("supabase_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_supabase_user_id" ON "users" USING btree ("supabase_user_id");