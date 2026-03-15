CREATE TABLE "platform_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"token_prefix" varchar(16) NOT NULL,
	"scopes" varchar(1024),
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_api_tokens" ADD CONSTRAINT "platform_api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_platform_api_tokens_hash" ON "platform_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_platform_api_tokens_tenant_user_status" ON "platform_api_tokens" USING btree ("tenant_id","user_id","is_revoked");--> statement-breakpoint
CREATE INDEX "idx_platform_api_tokens_prefix" ON "platform_api_tokens" USING btree ("token_prefix");