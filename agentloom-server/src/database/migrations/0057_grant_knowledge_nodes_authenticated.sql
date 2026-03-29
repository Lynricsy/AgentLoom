-- Retrofit GRANT for knowledge_nodes.
-- RLS policies alone are insufficient because the runtime switches to
-- SET LOCAL ROLE authenticated; PostgreSQL still requires table privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_nodes" TO "authenticated";
