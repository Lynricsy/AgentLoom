import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { workflowTemplates } from '../../database/schema';
import { TemplateNotFoundException } from './template.exceptions';
import type {
  TemplateListItem,
  TemplateDetail,
  PaginationMeta,
} from './dto/template.dto';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    category?: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ data: TemplateListItem[]; meta: PaginationMeta }> {
    const conditions = [eq(workflowTemplates.isPublished, true)];
    if (category) {
      conditions.push(eq(workflowTemplates.category, category));
    }
    const whereClause = and(...conditions);

    const [totalResult] = await this.db
      .select({ value: count() })
      .from(workflowTemplates)
      .where(whereClause);

    const total = totalResult?.value ?? 0;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select({
        id: workflowTemplates.id,
        slug: workflowTemplates.slug,
        name: workflowTemplates.name,
        description: workflowTemplates.description,
        category: workflowTemplates.category,
        tags: workflowTemplates.tags,
        thumbnailUrl: workflowTemplates.thumbnailUrl,
        metadata: workflowTemplates.metadata,
        displayOrder: workflowTemplates.displayOrder,
        createdAt: workflowTemplates.createdAt,
        updatedAt: workflowTemplates.updatedAt,
      })
      .from(workflowTemplates)
      .where(whereClause)
      .orderBy(workflowTemplates.displayOrder, workflowTemplates.createdAt)
      .limit(pageSize)
      .offset(offset);

    return {
      data: rows as TemplateListItem[],
      meta: { page, pageSize, total, totalPages },
    };
  }

  async findBySlug(slug: string): Promise<TemplateDetail> {
    const [row] = await this.db
      .select()
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.slug, slug),
          eq(workflowTemplates.isPublished, true),
        ),
      )
      .limit(1);

    if (!row) {
      throw new TemplateNotFoundException(slug);
    }

    return row as unknown as TemplateDetail;
  }
}
