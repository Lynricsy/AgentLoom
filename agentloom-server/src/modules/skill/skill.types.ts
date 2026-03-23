export interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
}

export interface SkillEntity {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  content: string | null;
  frontmatter: SkillFrontmatter | null;
  isBuiltin: boolean;
  status: SkillStatus;
  fileCount: number;
  totalSizeBytes: number;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SkillStatus = 'active' | 'archived';

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
}

export interface SkillPromptPayload {
  id: string;
  name: string;
  description: string;
  content: string | null;
}
