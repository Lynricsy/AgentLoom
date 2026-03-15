import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateWorkflowDefinitionSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: '工作流名称不能为空' })
      .max(255, { message: '工作流名称不能超过 255 个字符' }),
    description: z
      .string()
      .max(2000, { message: '工作流描述不能超过 2000 个字符' })
      .optional(),
    template_slug: z
      .string()
      .max(128, { message: '模板 slug 不能超过 128 个字符' })
      .optional(),
    marketplace_listing_id: z
      .string()
      .uuid({ message: 'Marketplace listing ID 必须是合法的 UUID' })
      .optional(),
    share_token: z
      .string()
      .min(1, { message: '分享 token 不能为空' })
      .max(128, { message: '分享 token 不能超过 128 个字符' })
      .optional(),
  })
  .refine(
    (value) => {
      const sources = [
        value.template_slug,
        value.marketplace_listing_id,
        value.share_token,
      ].filter(Boolean);
      return sources.length <= 1;
    },
    {
      message:
        'template_slug、marketplace_listing_id 与 share_token 只能同时提供其中之一',
      path: ['share_token'],
    },
  );

export class CreateWorkflowDefinitionDto extends createZodDto(
  CreateWorkflowDefinitionSchema,
) {}
