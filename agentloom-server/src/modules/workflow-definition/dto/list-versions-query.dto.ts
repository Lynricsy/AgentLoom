import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const listVersionsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, { message: '页码必须大于等于 1' })
    .default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, { message: '每页数量必须大于等于 1' })
    .max(100, { message: '每页数量不能超过 100' })
    .default(20),
});

export class ListVersionsQueryDto extends createZodDto(
  listVersionsQuerySchema,
) {}
