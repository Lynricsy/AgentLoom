import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DocumentContentSchema = z.object({
  url: z.string().url(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

export class DocumentContentDto extends createZodDto(DocumentContentSchema) {}
