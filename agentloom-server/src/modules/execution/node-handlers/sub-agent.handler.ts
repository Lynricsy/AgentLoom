export interface SubAgentNodeConfig {
  agentDefinitionId: string;
  agentVersionId?: string;
  inputMapping?: Record<string, unknown>;
}

export const MAX_SUB_AGENT_DEPTH = 5;

export { resolveSubAgent } from '../../agent-execution/subagent/resolve-subagent';
