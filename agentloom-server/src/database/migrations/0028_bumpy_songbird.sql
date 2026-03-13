CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_token" varchar(512) NOT NULL,
	"platform" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "device_tokens" TO "authenticated";--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_device_tokens_user_token" ON "device_tokens" USING btree ("user_id","device_token");--> statement-breakpoint
CREATE INDEX "idx_device_tokens_user_active" ON "device_tokens" USING btree ("user_id","is_active");
