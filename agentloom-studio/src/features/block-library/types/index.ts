export const BLOCK_CATEGORIES = [
  'analysis',
  'content',
  'development',
  'automation',
  'reporting',
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

export interface BlockPort {
  id: string;
  label: string;
  dataType:
    | 'model'
    | 'text'
    | 'json'
    | 'image'
    | 'audio'
    | 'tool'
    | 'sandbox'
    | 'knowledge';
  sourceNodeId?: string;
  sourcePortId?: string;
}

export interface BlockDefinition {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  inputPorts: BlockPort[];
  outputPorts: BlockPort[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface BlockMetadata {
  nodeCount: number;
  author?: string;
  version: number;
  createdFromWorkflowId?: string;
  exportedAt?: string;
}

export interface ReusableBlockListItem {
  id: string;
  name: string;
  description: string | null;
  category: BlockCategory | null;
  tags: string[];
  metadata: BlockMetadata | null;
  version: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReusableBlockDetail extends ReusableBlockListItem {
  definition: BlockDefinition;
  createdBy: string;
}
