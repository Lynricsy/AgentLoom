import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ListDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['uploaded', 'processing', 'ready', 'failed'])
    .optional(),
});

export class ListDocumentsQueryDto extends createZodDto(
  ListDocumentsQuerySchema,
) {}
