/**
 * 「文本 + 可选图片」工具输出的共用实现：远程工具（bridge）与内置插件
 * （browser 截图、eval show()）都用同一份 output schema 与渲染。
 *
 * 图片只在两个条件同时满足时作为 image block 回给模型：attachments 服务已挂载、
 * 当前模型路由声明接受图像输入；否则降级为纯文本（文件路径已写在文本里）。
 */
import type { Context } from '@deepseek-ai/cordis';
import {
  AttachmentId,
  type ImageAttachmentRef,
  type ImageMediaType,
} from '@deepseek-ai/dsh-attachment';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-llm';
import type { ToolRunContext, ValueSchemaSpec } from '@deepseek-ai/dsh-tools';

/**
 * 与 dsh-tool-fs read_image 的 IMAGE_VALUE_SCHEMA 同形（dsh defineTool 值 DSL）；
 * 原始 ToolDefinition 用 valueSchemaSpecToJsonSchema 转为 JSON Schema。
 */
export const IMAGE_VALUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: {
      type: 'string',
      enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      required: true,
    },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer', required: true },
    height: { type: 'integer', required: true },
    name: { type: 'string' },
    originalDimensions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        width: { type: 'integer', required: true },
        height: { type: 'integer', required: true },
      },
    },
  },
} as const satisfies ValueSchemaSpec;

export const TEXT_WITH_IMAGES_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', required: true },
    images: { type: 'array', items: IMAGE_VALUE_SCHEMA },
  },
} as const satisfies ValueSchemaSpec;

/** 输出值里的图片（可 JSON 序列化；attachmentId 去品牌化） */
export interface ImageValue {
  attachmentId: string;
  mediaType: ImageMediaType;
  bytes: number;
  width: number;
  height: number;
  name?: string;
  originalDimensions?: { width: number; height: number };
}

export interface TextWithImages {
  text: string;
  images?: ImageValue[];
}

export interface ImageInput {
  data: Uint8Array;
  mediaType: ImageMediaType;
  name?: string;
}

export interface ModelRoute {
  provider: string;
  model: string;
}

/** 图片附件能力：bridge 的 BridgeHost 与内置插件都经它保存图片 */
export interface ImageAttachmentHost {
  /** attachments 服务未挂载时返回 undefined */
  saveImages(inputs: readonly ImageInput[]): Promise<readonly ImageAttachmentRef[] | undefined>;
  modelAcceptsImages(route: ModelRoute): Promise<boolean>;
}

/** 由插件 Context 构造图片附件能力；attachments / llm 均为可选服务 */
export function createImageAttachmentHost(ctx: Context): ImageAttachmentHost {
  return {
    saveImages: async (inputs) => {
      const attachments = ctx.get('attachments');
      return attachments ? attachments.saveImages(inputs) : undefined;
    },
    modelAcceptsImages: async ({ provider, model }) => {
      const llm = ctx.get('llm');
      if (!llm) return false;
      const info = await llm.resolveModelInfo(provider, model);
      return info.inputModalities?.includes('image') === true;
    },
  };
}

/** 工具调用所属的模型路由：会话最新路由头优先，其次 agent 选项（同 read_image） */
export function execModelRoute(exec: ToolRunContext): ModelRoute | undefined {
  const routed = exec.agent?.session.requestHeader()?.config;
  const provider = routed?.provider ?? exec.agent?.options.provider;
  const model = routed?.model ?? exec.agent?.options.model;
  if (provider === undefined || model === undefined) return undefined;
  return { provider: String(provider), model: String(model) };
}

/**
 * 在模型可接收图像时把图片存为附件并返回输出值；任一条件不满足返回 undefined，
 * 调用方只回文本。
 */
export async function attachImages(
  host: ImageAttachmentHost,
  route: ModelRoute | undefined,
  images: readonly ImageInput[],
): Promise<ImageValue[] | undefined> {
  if (images.length === 0 || !route) return undefined;
  if (!(await host.modelAcceptsImages(route))) return undefined;
  const refs = await host.saveImages(images);
  if (!refs) return undefined;
  return refs.map((ref) => ({
    attachmentId: String(ref.attachmentId),
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...(ref.name === undefined ? {} : { name: ref.name }),
    ...(ref.originalDimensions === undefined
      ? {}
      : { originalDimensions: { ...ref.originalDimensions } }),
  }));
}

/** 渲染为 text 块 + image 块 */
export function renderTextWithImages(value: TextWithImages) {
  return [
    { type: 'text' as const, text: value.text },
    ...(value.images ?? []).map((image) => ({
      type: 'image' as const,
      attachment: {
        ...image,
        attachmentId: AttachmentId(image.attachmentId),
      } satisfies ImageAttachmentRef,
    })),
  ];
}
