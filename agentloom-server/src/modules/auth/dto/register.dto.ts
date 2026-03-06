import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, '密码长度至少 8 个字符')
  .refine((val) => /[A-Z]/.test(val), '密码必须包含至少一个大写字母')
  .refine((val) => /[a-z]/.test(val), '密码必须包含至少一个小写字母')
  .refine((val) => /[0-9]/.test(val), '密码必须包含至少一个数字');

const RegisterSchema = z.object({
  email: z.string().email('无效的邮箱格式'),
  password: passwordSchema,
  display_name: z.string().max(100, '显示名称最多 100 个字符').optional(),
});

export class RegisterDto extends createZodDto(RegisterSchema) {}
