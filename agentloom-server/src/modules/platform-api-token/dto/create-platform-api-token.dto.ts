import { parsePlatformApiScopes, PERMISSIONS } from '@agentloom/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * wire 格式保持字符串（兼容既有调用方）：空格或逗号分隔，只接受 RBAC 权限词表（PERMISSIONS）；
 * 存储时规范化为按词表顺序、空格分隔。留空表示继承所有者全部权限。
 */
const ScopesSchema = z
  .string()
  .max(1024)
  .optional()
  .transform((raw, ctx) => {
    const { scopes, invalid } = parsePlatformApiScopes(raw);
    if (invalid.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `未知作用域：${invalid.join(', ')}；可选值：${PERMISSIONS.join(', ')}`,
      });
      return z.NEVER;
    }
    return scopes?.join(' ');
  });

export const CreatePlatformApiTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: ScopesSchema,
  expires_at: z.iso.datetime().optional(),
});

export type CreatePlatformApiTokenDto = z.input<
  typeof CreatePlatformApiTokenSchema
>;

export class CreatePlatformApiTokenSwaggerDto extends createZodDto(
  CreatePlatformApiTokenSchema,
) {}
