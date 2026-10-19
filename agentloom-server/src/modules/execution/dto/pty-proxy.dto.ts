import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PtySessionIdSchema = z.string().trim().min(1, 'sessionId 不能为空');

/**
 * Studio 经 toSnakeBody 发送 `session_id`，其它客户端发送 `sessionId`，两者都接受，
 * 统一输出为 `sessionId`；都缺失时报 422。
 */
function resolveSessionId(
  sessionId: string | undefined,
  snakeSessionId: string | undefined,
  ctx: z.RefinementCtx,
): string {
  const resolved = sessionId ?? snakeSessionId;
  if (resolved === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['sessionId'],
      message: 'sessionId 不能为空',
    });
    return z.NEVER;
  }
  return resolved;
}

export const ptyBufferDumpDtoSchema = z
  .strictObject({
    sessionId: PtySessionIdSchema.optional(),
    session_id: PtySessionIdSchema.optional(),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).optional(),
    pattern: z.string().optional(),
  })
  .transform(({ sessionId, session_id, ...options }, ctx) => ({
    sessionId: resolveSessionId(sessionId, session_id, ctx),
    ...options,
  }));

export class PtyBufferDumpDto extends createZodDto(ptyBufferDumpDtoSchema) {}

export const ptyWriteDtoSchema = z
  .strictObject({
    sessionId: PtySessionIdSchema.optional(),
    session_id: PtySessionIdSchema.optional(),
    data: z.string(),
  })
  .transform(({ sessionId, session_id, data }, ctx) => ({
    sessionId: resolveSessionId(sessionId, session_id, ctx),
    data,
  }));

export class PtyWriteDto extends createZodDto(ptyWriteDtoSchema) {}
