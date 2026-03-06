import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'creator', 'operator', 'viewer'], {
    message: '无效的角色类型',
  }),
});

export class UpdateMemberRoleDto extends createZodDto(
  UpdateMemberRoleSchema,
) {}
