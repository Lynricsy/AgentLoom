export const TEMPLATE_CATEGORIES = [
  'analysis',
  'content',
  'development',
  'automation',
  'reporting',
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface TemplateDefinition {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface TemplateMetadata {
  author?: string;
  version?: string;
  estimatedRuntimeSeconds?: number;
  complexity?: 'beginner' | 'intermediate' | 'advanced';
  nodeCount?: number;
  requiredCapabilities?: string[];
  [key: string]: unknown;
}

export interface TemplateListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: TemplateCategory;
  tags: string[];
  thumbnailUrl: string | null;
  metadata: TemplateMetadata;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDetail extends TemplateListItem {
  definition: TemplateDefinition;
}
