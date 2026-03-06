CREATE TABLE "revoked_tokens" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(36),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_revoked_tokens_expires_at" ON "revoked_tokens" USING btree ("expires_at");