import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Browse ---------------

export const BrowseQuerySchema = z
  .object({
    uri: z.string().min(1, 'URI 不能为空').max(600),
    nav_only: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .transform((v) => ({
    uri: v.uri,
    navOnly: v.nav_only ?? false,
  }));

export class BrowseQueryDto extends createZodDto(BrowseQuerySchema) {}

// --------------- Glossary ---------------

export const AddGlossaryKeywordSchema = z.object({
  keyword: z.string().min(1, '关键词不能为空').max(256),
});

export class AddGlossaryKeywordDto extends createZodDto(
  AddGlossaryKeywordSchema,
) {}

export const RemoveGlossaryKeywordSchema = z.object({
  keyword: z.string().min(1, '关键词不能为空').max(256),
});

export class RemoveGlossaryKeywordDto extends createZodDto(
  RemoveGlossaryKeywordSchema,
) {}
