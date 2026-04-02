import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../database.module';
import { skills } from '../schema';

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';

export const BUILTIN_SKILL_SLUGS = [
  'code-review',
  'documentation',
  'test-generation',
  'refactoring',
  'debugging',
  'self-evolution',
] as const;

function collectSkillFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSkillFiles(entryPath));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

export async function seedSkills(db: DrizzleDB): Promise<number> {
  // session_replication_role = 'replica' bypasses PostgreSQL trigger-based FK
  // enforcement, allowing builtin skills to be inserted with a sentinel system
  // UUID without requiring a real users/organizations row to exist first.
  await db.execute(sql`SET session_replication_role = 'replica'`);

  try {
    for (const name of BUILTIN_SKILL_SLUGS) {
      const skillDir = join(__dirname, 'skills', name);
      const filePath = join(skillDir, 'SKILL.md');
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      const skillFiles = collectSkillFiles(skillDir);
      const totalSizeBytes = skillFiles.reduce(
        (sum, currentFile) => sum + statSync(currentFile).size,
        0,
      );
      const fileCount = skillFiles.length;

      await db
        .insert(skills)
        .values({
          tenantId: SYSTEM_UUID,
          name: frontmatter['name'] ?? name,
          slug: name,
          description: frontmatter['description'] ?? '',
          content,
          frontmatter: frontmatter as Record<string, unknown>,
          isBuiltin: true,
          status: 'active',
          fileCount,
          totalSizeBytes,
          createdBy: SYSTEM_UUID,
          updatedBy: SYSTEM_UUID,
        })
        .onConflictDoUpdate({
          target: [skills.tenantId, skills.slug],
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            content: sql`excluded.content`,
            frontmatter: sql`excluded.frontmatter`,
            status: sql`excluded.status`,
            fileCount: sql`excluded.file_count`,
            totalSizeBytes: sql`excluded.total_size_bytes`,
            updatedAt: sql`now()`,
          },
        });
    }
  } finally {
    await db.execute(sql`SET session_replication_role = DEFAULT`);
  }

  return BUILTIN_SKILL_SLUGS.length;
}
