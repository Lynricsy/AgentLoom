-- Purge historical empty agent conversations that were created when the
-- frontend opened `/conversations/new` eagerly before the delayed-create fix.
-- Safe because only zero-message conversations are targeted; related sandbox
-- and memory sessions are cascade-deleted through existing foreign keys.

DELETE FROM "agent_conversations" AS "conversations"
WHERE NOT EXISTS (
  SELECT 1
  FROM "agent_messages" AS "messages"
  WHERE "messages"."conversation_id" = "conversations"."id"
);
