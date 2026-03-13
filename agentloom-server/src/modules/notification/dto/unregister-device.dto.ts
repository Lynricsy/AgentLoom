import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const unregisterDeviceSchema = z.object({
  deviceToken: z.string().min(1).max(512),
});

export class UnregisterDeviceDto extends createZodDto(unregisterDeviceSchema) {}
