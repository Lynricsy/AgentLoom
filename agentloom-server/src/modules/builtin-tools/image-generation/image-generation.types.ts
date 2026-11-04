import type { LlmProvider } from '../../../database/schema/llm-providers.schema';

export const IMAGE_GENERATION_SIZES = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
] as const;

export type ImageGenerationSize = (typeof IMAGE_GENERATION_SIZES)[number];

export type GeneratedImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface GeneratedImage {
  mediaType: GeneratedImageMediaType;
  data: Buffer;
}

/** 租户默认 image 模型解析结果；只携带发请求所需字段，密钥在 generate 时才解密 */
export interface ResolvedImageModel {
  configId: string;
  modelId: string;
  protocol: LlmProvider['apiProtocol'];
  baseUrl: string | undefined;
  providerSlug: string;
  apiKeyId: string | null;
  organizationId: string;
}

export interface ImageGenerationInput {
  prompt: string;
  size: ImageGenerationSize;
}
