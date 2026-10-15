ALTER TABLE "routing_decisions" ALTER COLUMN "execution_step_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD COLUMN "fallback_reason" varchar(40);--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD COLUMN "fallback_source" varchar(20);--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_routing_decisions_conversation_id" ON "routing_decisions" USING btree ("conversation_id");--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "chk_routing_decisions_subject" CHECK (("routing_decisions"."execution_step_id" IS NOT NULL) <> ("routing_decisions"."conversation_id" IS NOT NULL));