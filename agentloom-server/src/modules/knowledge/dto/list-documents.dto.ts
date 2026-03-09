import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DOCUMENT_STATUS_VALUES } from '../knowledge.constants';

const DocumentStatusSchema = z.enum(DOCUMENT_STATUS_VALUES);

function normalizeStatusQuery(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string'
        ? item.split(',').map((entry) => entry.trim())
        : item,
    );
  }

  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim());
  }

  return value;
}

const PageSizeSchema = z.coerce.number().int().min(1).max(100).optional();

export const ListDocumentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: PageSizeSchema,
    page_size: PageSizeSchema,
    status: z.preprocess(
      normalizeStatusQuery,
      z.array(DocumentStatusSchema).optional(),
    ),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize ?? value.page_size ?? 20,
    status: value.status,
  }));

export class ListDocumentsQueryDto extends createZodDto(
  ListDocumentsQuerySchema,
) {}
