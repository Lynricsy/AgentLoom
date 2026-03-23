export const SKILL_CATEGORIES = [
  'writing',
  'analysis',
  'code',
  'research',
  'automation',
  'communication',
  'data',
  'reasoning',
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export type SkillStatus = 'active' | 'inactive' | 'deprecated';

export interface SkillParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

export interface SkillMetadata {
  author?: string;
  version?: string;
  complexity?: 'beginner' | 'intermediate' | 'advanced';
  estimatedTokens?: number;
  requiredModels?: string[];
  compatibleNodeTypes?: string[];
  [key: string]: unknown;
}

export interface SkillListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  status: SkillStatus;
  tags: string[];
  iconUrl: string | null;
  usageCount: number;
  metadata: SkillMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends SkillListItem {
  systemPrompt: string | null;
  inputSchema: Record<string, SkillParameterSchema>;
  outputSchema: Record<string, SkillParameterSchema>;
  exampleInputs: Record<string, unknown>[];
  changelog: string | null;
}
