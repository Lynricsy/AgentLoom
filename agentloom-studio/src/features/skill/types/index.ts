import type { ResourceSourceKind } from '@/shared/lib/resourceSource';

export type SkillStatus = 'active' | 'archived';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
}

export interface Skill {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  content: string | null;
  frontmatter: SkillFrontmatter | null;
  isBuiltin: boolean;
  status: SkillStatus;
  fileCount: number;
  totalSizeBytes: number;
  version: number;
  sourceKind?: ResourceSourceKind;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SkillListItem = Skill;
