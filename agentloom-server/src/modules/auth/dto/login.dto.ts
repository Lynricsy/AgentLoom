import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email('无效的邮箱格式'),
  password: z.string().min(1, '密码不能为空'),
});

export class LoginDto extends createZodDto(LoginSchema) {}
