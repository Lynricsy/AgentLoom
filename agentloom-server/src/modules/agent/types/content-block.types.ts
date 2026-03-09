import { z } from 'zod';

// ─── ContentBlock 变体 Schema ────────────────────────────────

/** 文本内容块 */
export const TextContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1, '文本内容不能为空'),
});

/** 图片内容块 */
export const ImageContentBlockSchema = z.object({
  type: z.literal('image'),
  data: z.string().min(1, '图片数据不能为空'),
  mimeType: z.string().regex(/^image\//, 'mimeType 必须以 image/ 开头'),
});

/** 音频内容块 */
export const AudioContentBlockSchema = z.object({
  type: z.literal('audio'),
  data: z.string().min(1, '音频数据不能为空'),
  mimeType: z.string().regex(/^audio\//, 'mimeType 必须以 audio/ 开头'),
});

/** 资源内容块（内联数据） */
export const ResourceContentBlockSchema = z.object({
  type: z.literal('resource'),
  uri: z.string().min(1, 'URI 不能为空'),
  text: z.string().optional(),
  blob: z.string().optional(),
  mimeType: z.string().optional(),
});

/** 资源链接内容块（引用） */
export const ResourceLinkContentBlockSchema = z.object({
  type: z.literal('resource_link'),
  uri: z.string().min(1, 'URI 不能为空'),
  title: z.string().optional(),
  mimeType: z.string().optional(),
});

// ─── 联合类型 Schema ────────────────────────────────────────

/** ContentBlock 判别联合 Schema（按 type 字段区分） */
export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextContentBlockSchema,
  ImageContentBlockSchema,
  AudioContentBlockSchema,
  ResourceContentBlockSchema,
  ResourceLinkContentBlockSchema,
]);

/** ContentBlock 数组 Schema */
export const ContentBlockArraySchema = z
  .array(ContentBlockSchema)
  .min(1, '至少需要一个 ContentBlock');

// ─── TypeScript 类型导出 ─────────────────────────────────────

export type TextContentBlock = z.infer<typeof TextContentBlockSchema>;
export type ImageContentBlock = z.infer<typeof ImageContentBlockSchema>;
export type AudioContentBlock = z.infer<typeof AudioContentBlockSchema>;
export type ResourceContentBlock = z.infer<typeof ResourceContentBlockSchema>;
export type ResourceLinkContentBlock = z.infer<
  typeof ResourceLinkContentBlockSchema
>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// ─── 类型守卫 ───────────────────────────────────────────────

/** 类型守卫：判断是否为文本内容块 */
export function isTextContentBlock(
  block: ContentBlock,
): block is TextContentBlock {
  return block.type === 'text';
}

/** 类型守卫：判断是否为图片内容块 */
export function isImageContentBlock(
  block: ContentBlock,
): block is ImageContentBlock {
  return block.type === 'image';
}

/** 类型守卫：判断是否为音频内容块 */
export function isAudioContentBlock(
  block: ContentBlock,
): block is AudioContentBlock {
  return block.type === 'audio';
}

/** 类型守卫：判断是否为资源内容块 */
export function isResourceContentBlock(
  block: ContentBlock,
): block is ResourceContentBlock {
  return block.type === 'resource';
}

/** 类型守卫：判断是否为资源链接内容块 */
export function isResourceLinkContentBlock(
  block: ContentBlock,
): block is ResourceLinkContentBlock {
  return block.type === 'resource_link';
}
