import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const InviteMemberSchema = z.object({
  email: z.string().email({ message: '请输入有效的邮箱地址' }),
  role: z
    .enum(['owner', 'admin', 'creator', 'operator', 'viewer'], {
      message: '无效的角色类型',
    })
    .default('viewer'),
});

export class InviteMemberDto extends createZodDto(InviteMemberSchema) {}
