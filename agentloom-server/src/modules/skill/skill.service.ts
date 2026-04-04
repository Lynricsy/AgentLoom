import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import type { DrizzleDB } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';
import { appendSlugSuffix, generateSlug } from '../organization/slug.utils';
import { ResourceSourceService } from '../resource-source/resource-source.service';
import type { CreateSkillDtoType } from './dto/create-skill.dto';
import type { SkillQueryDtoType } from './dto/skill-query.dto';
import type { UpdateSkillDtoType } from './dto/update-skill.dto';
import { SkillStorageService } from './skill-storage.service';

export interface SkillUploadFile {
  fieldname: string;
  filename: string;
  buffer: Buffer;
  mimetype: string;
}

const MAX_SLUG_RETRIES = 3;
type SkillWithSourceKind = schema.SkillRecord & {
  sourceKind: schema.ResourceSourceKind;
};

@Injectable()
export class SkillService {
  private readonly logger = new Logger(SkillService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly skillStorageService: SkillStorageService,
    private readonly resourceSourceService: ResourceSourceService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /**
   * 解析 SKILL.md 内容中的 YAML frontmatter（平面 key: value 格式）
   */
  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return { frontmatter: {}, body: content };

    const yamlBlock = match[1];
    const body = content.slice(match[0].length).replace(/^\r?\n/, '');
    const frontmatter: Record<string, unknown> = {};

    for (const line of yamlBlock.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key) frontmatter[key] = value;
    }

    return { frontmatter, body };
  }

  /**
   * 从文件列表中提取 SKILL.md 内容（如有）
   */
  private extractSkillMdContent(files?: SkillUploadFile[]): string | null {
    if (!files?.length) return null;
    const skillMd = files.find((f) => f.filename.toLowerCase() === 'skill.md');
    return skillMd ? skillMd.buffer.toString('utf-8') : null;
  }

  /**
   * 计算文件列表的 fileCount 和 totalSizeBytes
   */
  private computeFileMeta(files: { name: string; size: number }[]): {
    fileCount: number;
    totalSizeBytes: number;
  } {
    return {
      fileCount: files.length,
      totalSizeBytes: files.reduce((sum, f) => sum + f.size, 0),
    };
  }

  private collectBuiltinSkillFiles(dirPath: string): string[] {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.collectBuiltinSkillFiles(entryPath));
        continue;
      }

      files.push(entryPath);
    }

    return files;
  }

  private loadBuiltinSkillFiles(
    slug: string,
    fallbackContent?: string | null,
  ): Record<string, string> {
    const candidateDirs = [
      join(process.cwd(), 'src', 'database', 'seeds', 'skills', slug),
      join(__dirname, '../../database/seeds/skills', slug),
    ];
    const skillDir = candidateDirs.find((dirPath) => existsSync(dirPath));

    if (!skillDir) {
      return typeof fallbackContent === 'string'
        ? { 'SKILL.md': fallbackContent }
        : {};
    }

    const files = this.collectBuiltinSkillFiles(skillDir);
    const entries = files.map((filePath) => [
      relative(skillDir, filePath).replace(/\\/g, '/'),
      readFileSync(filePath, 'utf-8'),
    ] as const);
    const result = Object.fromEntries(entries);

    if (
      !('SKILL.md' in result) &&
      typeof fallbackContent === 'string' &&
      fallbackContent.length > 0
    ) {
      return {
        ...result,
        'SKILL.md': fallbackContent,
      };
    }

    return result;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateSkillDtoType,
    files?: SkillUploadFile[],
  ): Promise<SkillWithSourceKind> {
    let content = dto.content ?? null;
    const skillMdFromFile = this.extractSkillMdContent(files);
    if (!content && skillMdFromFile) {
      content = skillMdFromFile;
    }

    let frontmatter: Record<string, unknown> | null = null;
    if (content) {
      const parsed = this.parseFrontmatter(content);
      if (Object.keys(parsed.frontmatter).length > 0) {
        frontmatter = parsed.frontmatter;
      }
    }

    let slug = generateSlug(dto.name);
    let created: schema.SkillRecord | undefined;

    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
      try {
        const row = await this.tenantDb.transaction(async (tx) => {
          const [createdRow] = await tx
            .insert(schema.skills)
            .values({
              tenantId,
              name: dto.name,
              slug,
              description: dto.description,
              content,
              frontmatter,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();

          return createdRow;
        });
        created = row;
        break;
      } catch (error) {
        const isUniqueViolation = hasPostgresErrorCode(error, '23505');

        if (!isUniqueViolation || attempt === MAX_SLUG_RETRIES) {
          throw error;
        }

        slug = appendSlugSuffix(slug);
      }
    }

    if (!created) {
      throw new Error('Unreachable: slug retry loop exhausted');
    }

    this.logger.log(`Skill created: ${created.id} (${created.slug})`);

    if (files?.length) {
      for (const file of files) {
        await this.skillStorageService.uploadSkillFile(
          tenantId,
          created.id,
          file.filename,
          file.buffer,
          file.mimetype,
        );
      }

      const storedFiles = await this.skillStorageService.listSkillFiles(
        tenantId,
        created.id,
      );
      const meta = this.computeFileMeta(storedFiles);

      const [updated] = await this.tenantDb
        .update(schema.skills)
        .set({
          fileCount: meta.fileCount,
          totalSizeBytes: meta.totalSizeBytes,
          updatedAt: new Date(),
        })
        .where(eq(schema.skills.id, created.id))
        .returning();

      return {
        ...updated,
        sourceKind: 'manual',
      };
    }

    return {
      ...created,
      sourceKind: 'manual',
    };
  }

  async findAll(query: SkillQueryDtoType): Promise<{
    data: SkillWithSourceKind[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const { page, pageSize, status, isBuiltin, search, sourceKind } = query;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (status) {
      conditions.push(eq(schema.skills.status, status));
    }
    if (isBuiltin !== undefined) {
      conditions.push(eq(schema.skills.isBuiltin, isBuiltin));
    }
    if (search) {
      conditions.push(
        or(
          ilike(schema.skills.name, `%${search}%`),
          ilike(schema.skills.description, `%${search}%`),
        ),
      );
    }
    if (sourceKind) {
      const importedExistsCondition =
        this.resourceSourceService.buildShareImportedExistsCondition({
          resourceType: 'skill',
          resourceIdColumn: schema.skills.id,
        });

      conditions.push(
        sourceKind === 'share_imported'
          ? importedExistsCondition
          : sql`not (${importedExistsCondition})`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.skills)
        .where(whereClause)
        .orderBy(desc(schema.skills.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.skills)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'skill',
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row) => ({
        ...row,
        sourceKind: sourceKindMap.get(row.id) ?? 'manual',
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(
    tenantId: string,
    skillId: string,
  ): Promise<SkillWithSourceKind> {
    const [row] = await this.tenantDb
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, skillId));

    if (!row) {
      throw new NotFoundException(`Skill ${skillId} 不存在`);
    }

    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'skill',
      [skillId],
    );

    return {
      ...row,
      sourceKind: sourceKindMap.get(skillId) ?? 'manual',
    };
  }

  async findByIds(
    tenantId: string,
    skillIds: string[],
  ): Promise<schema.SkillRecord[]> {
    if (skillIds.length === 0) return [];

    return this.tenantDb
      .select()
      .from(schema.skills)
      .where(inArray(schema.skills.id, skillIds));
  }

  async getSkillFileMap(
    tenantId: string,
    skillId: string,
    fallbackContent?: string | null,
    options?: {
      isBuiltin?: boolean;
      slug?: string;
    },
  ): Promise<Record<string, string>> {
    const files = await this.skillStorageService.getSkillFileMap(
      tenantId,
      skillId,
    );

    if (Object.keys(files).length === 0) {
      if (options?.isBuiltin && options.slug) {
        const builtinFiles = this.loadBuiltinSkillFiles(
          options.slug,
          fallbackContent,
        );
        if (Object.keys(builtinFiles).length > 0) {
          return builtinFiles;
        }
      }

      return typeof fallbackContent === 'string'
        ? { 'SKILL.md': fallbackContent }
        : {};
    }

    if (
      !('SKILL.md' in files) &&
      typeof fallbackContent === 'string' &&
      fallbackContent.length > 0
    ) {
      return {
        ...files,
        'SKILL.md': fallbackContent,
      };
    }

    return files;
  }

  async update(
    tenantId: string,
    userId: string,
    skillId: string,
    dto: UpdateSkillDtoType,
    files?: SkillUploadFile[],
  ): Promise<SkillWithSourceKind> {
    const setClause: Record<string, any> = {
      version: sql`${schema.skills.version} + 1`,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) setClause.name = dto.name;
    if (dto.description !== undefined) setClause.description = dto.description;

    let newContent = dto.content ?? null;
    const skillMdFromFile = this.extractSkillMdContent(files);
    if (!newContent && skillMdFromFile) {
      newContent = skillMdFromFile;
    }

    if (newContent !== null) {
      setClause.content = newContent;
      const parsed = this.parseFrontmatter(newContent);
      if (Object.keys(parsed.frontmatter).length > 0) {
        setClause.frontmatter = parsed.frontmatter;
      } else {
        setClause.frontmatter = null;
      }
    }

    const updateResult = await this.tenantDb
      .update(schema.skills)
      .set(setClause)
      .where(
        and(
          eq(schema.skills.id, skillId),
          eq(schema.skills.version, dto.occVersion),
        ),
      )
      .returning();

    if (updateResult.length === 0) {
      throw new ConflictException(`Skill ${skillId} 版本冲突，请刷新后重试`);
    }

    if (files?.length) {
      for (const file of files) {
        await this.skillStorageService.uploadSkillFile(
          tenantId,
          skillId,
          file.filename,
          file.buffer,
          file.mimetype,
        );
      }

      const storedFiles = await this.skillStorageService.listSkillFiles(
        tenantId,
        skillId,
      );
      const meta = this.computeFileMeta(storedFiles);

      const [refreshed] = await this.tenantDb
        .update(schema.skills)
        .set({
          fileCount: meta.fileCount,
          totalSizeBytes: meta.totalSizeBytes,
          updatedAt: new Date(),
        })
        .where(eq(schema.skills.id, skillId))
        .returning();

      const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
        'skill',
        [skillId],
      );

      return {
        ...refreshed,
        sourceKind: sourceKindMap.get(skillId) ?? 'manual',
      };
    }

    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'skill',
      [skillId],
    );

    return {
      ...updateResult[0],
      sourceKind: sourceKindMap.get(skillId) ?? 'manual',
    };
  }

  async delete(tenantId: string, skillId: string): Promise<void> {
    const [skill] = await this.tenantDb
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, skillId));

    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} 不存在`);
    }

    await this.skillStorageService.deleteSkillFiles(tenantId, skillId);

    await this.tenantDb
      .delete(schema.skills)
      .where(eq(schema.skills.id, skillId));

    this.logger.log(`Skill deleted: ${skillId}`);
  }

  async archive(
    tenantId: string,
    userId: string,
    skillId: string,
  ): Promise<SkillWithSourceKind> {
    const [skill] = await this.tenantDb
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, skillId));

    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} 不存在`);
    }

    if (skill.status === 'archived') {
      throw new ConflictException(`Skill ${skillId} 已处于归档状态`);
    }

    const [updated] = await this.tenantDb
      .update(schema.skills)
      .set({
        status: 'archived',
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.skills.id, skillId))
      .returning();

    this.logger.log(`Skill archived: ${skillId}`);
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'skill',
      [skillId],
    );

    return {
      ...updated,
      sourceKind: sourceKindMap.get(skillId) ?? 'manual',
    };
  }

  /**
   * 刷新 Skill 的文件元数据（fileCount, totalSizeBytes）
   * 在单文件上传/删除后调用，确保 DB 与存储一致
   */
  async refreshFileMeta(tenantId: string, skillId: string): Promise<void> {
    const storedFiles = await this.skillStorageService.listSkillFiles(
      tenantId,
      skillId,
    );
    const meta = this.computeFileMeta(storedFiles);

    await this.tenantDb
      .update(schema.skills)
      .set({
        fileCount: meta.fileCount,
        totalSizeBytes: meta.totalSizeBytes,
        updatedAt: new Date(),
      })
      .where(eq(schema.skills.id, skillId));

    this.logger.debug(
      `Skill ${skillId} 文件元数据已刷新: fileCount=${meta.fileCount}, totalSizeBytes=${meta.totalSizeBytes}`,
    );
  }
}
