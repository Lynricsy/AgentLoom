import type {
  CreateReusableBlockDtoCategoryEnum,
  CreateReusableBlockDtoDefinitionInputPortsInner,
  CreateReusableBlockDtoDefinitionViewport,
  CreateReusableBlockDtoMetadata,
} from '@agentloom/api-client';

export const BLOCK_CATEGORIES = [
  'analysis',
  'content',
  'development',
  'automation',
  'reporting',
] as const;

export type BlockCategory = CreateReusableBlockDtoCategoryEnum;

/**
 * 复用块端口（生成模型）。
 * `dataType` 直接用生成枚举：原手写联合只列了 8 个值，
 * 漏掉了 server 也接受的 `skill` / `memory`。
 */
export type BlockPort = CreateReusableBlockDtoDefinitionInputPortsInner;

/** 生成模型要求每个节点带 `id`，每条边带 `id` / `source` / `target` */
export interface BlockDefinitionNode extends Record<string, unknown> {
  id: string;
}

export interface BlockDefinitionEdge extends Record<string, unknown> {
  id: string;
  source: string;
  target: string;
}

export interface BlockDefinition {
  nodes: BlockDefinitionNode[];
  edges: BlockDefinitionEdge[];
  inputPorts: BlockPort[];
  outputPorts: BlockPort[];
  viewport?: CreateReusableBlockDtoDefinitionViewport;
}

export type BlockMetadata = CreateReusableBlockDtoMetadata;

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
