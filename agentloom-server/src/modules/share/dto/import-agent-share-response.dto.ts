export type AgentShareImportReportOutcome =
  'cloned' | 'cleared' | 'needs_rebind' | 'skipped_ephemeral';

export interface AgentShareImportReportItem {
  resourceType:
    | 'agent_definition'
    | 'knowledge_base'
    | 'memory_instance'
    | 'mcp_server_config'
    | 'skill'
    | 'workspace';
  sourceResourceId?: string | null;
  targetResourceId?: string | null;
  title: string;
  outcome: AgentShareImportReportOutcome;
  message: string;
}

export interface ImportAgentShareResponse {
  agentDefinitionId: string;
  name: string;
  publishedVersionId: string | null;
  report: AgentShareImportReportItem[];
  summary: {
    cloned: number;
    cleared: number;
    needsRebind: number;
    skippedEphemeral: number;
  };
}
