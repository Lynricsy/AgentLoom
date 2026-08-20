import { useEffect, useRef } from "react";
import { useAgent } from "@/features/agent";
import { useAgentCanvasActions } from "../stores/agent-canvas.store";

export function useAgentCanvasHydration(agentId: string) {
  const query = useAgent(agentId);
  const { hydrateAgent, reset } = useAgentCanvasActions();
  const hydratedAgentIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      hydratedAgentIdRef.current = null;
      reset();
    };
  }, [agentId, reset]);

  useEffect(() => {
    if (query.data && hydratedAgentIdRef.current !== agentId) {
      hydrateAgent(agentId, query.data);
      hydratedAgentIdRef.current = agentId;
    }
  }, [agentId, hydrateAgent, query.data]);
  return query;
}
