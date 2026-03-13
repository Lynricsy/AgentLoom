import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerDeviceSchema = z.object({
  deviceToken: z.string().min(1).max(512),
  platform: z.enum(['android', 'ios']),
});

export class RegisterDeviceDto extends createZodDto(registerDeviceSchema) {}
