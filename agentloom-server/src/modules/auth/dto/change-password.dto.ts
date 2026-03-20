import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, '当前密码不能为空'),
  new_password: z
    .string()
    .min(8, '密码长度至少 8 个字符')
    .refine((val) => /[A-Z]/.test(val), '密码必须包含至少一个大写字母')
    .refine((val) => /[a-z]/.test(val), '密码必须包含至少一个小写字母')
    .refine((val) => /[0-9]/.test(val), '密码必须包含至少一个数字'),
});

export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
