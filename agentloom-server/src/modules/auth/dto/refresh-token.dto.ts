import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token 不能为空'),
});

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}
