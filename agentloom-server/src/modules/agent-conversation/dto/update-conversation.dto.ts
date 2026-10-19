import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 执行进程把运行时状态写在对话 metadata 的这些键下，调用方不可写入 */
export const RESERVED_CONVERSATION_METADATA_KEYS = ['execution'] as const;

/** 调用方可写的对话 metadata：拒绝保留键（Studio 与对外 API 同一规则） */
export const ConversationMetadataInputSchema = z
  .record(z.string(), z.unknown())
  .superRefine((metadata, ctx) => {
    for (const key of RESERVED_CONVERSATION_METADATA_KEYS) {
      if (key in metadata) {
        ctx.addIssue({
          code: 'custom',
          message: `metadata.${key} is reserved`,
          path: [key],
        });
      }
    }
  });

export const UpdateConversationSchema = z.object({
  title: z.string().max(255).optional(),
  /** 替换调用方可写的键；保留键（运行态）由服务端原样保留 */
  metadata: ConversationMetadataInputSchema.optional(),
});

export class UpdateConversationDto extends createZodDto(
  UpdateConversationSchema,
) {}
