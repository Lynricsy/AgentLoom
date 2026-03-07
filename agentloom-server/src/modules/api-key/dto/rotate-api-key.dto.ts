import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const rotateApiKeySchema = z.object({
  apiKey: z.string().min(1, '新的 API 密钥不能为空'),
});

export class RotateApiKeyDto extends createZodDto(rotateApiKeySchema) {}
