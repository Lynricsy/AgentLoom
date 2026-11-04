import { Inject, Injectable } from '@nestjs/common';

import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import {
  appendTerminalPath,
  hasTerminalPath,
} from '../../llm/llm-base-url.util';
import { LlmService } from '../../llm/llm.service';
import {
  ImageGenerationFailedException,
  ImageGenerationUnsupportedProtocolException,
} from './image-generation.exceptions';
import type {
  GeneratedImage,
  GeneratedImageMediaType,
  ImageGenerationInput,
  ImageGenerationSize,
  ResolvedImageModel,
} from './image-generation.types';

/** 单次图像生成请求超时（含下载 URL 形式的结果） */
const IMAGE_GENERATION_TIMEOUT_MS = 120_000;
const ERROR_BODY_SNIPPET_MAX = 500;

const GEMINI_ASPECT_RATIOS: Record<ImageGenerationSize, string> = {
  '1024x1024': '1:1',
  '1536x1024': '16:9',
  '1024x1536': '9:16',
};

const OUTPUT_FORMAT_MEDIA_TYPES: Record<string, GeneratedImageMediaType> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * 用租户默认 image 模型生成图片：OpenAI 兼容协议走 Images API，google 协议走 Gemini generateContent。
 * 模型解析与密钥解密在租户事务内完成，HTTP 请求在事务外发出。
 */
@Injectable()
export class ImageGenerationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llmService: LlmService,
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
  ) {}

  async resolveTenantImageModel(
    tenantId: string,
  ): Promise<ResolvedImageModel | null> {
    const resolved = await runInTenantTransaction(this.db, tenantId, () =>
      this.llmService.findDefaultByType(tenantId, 'image'),
    );
    if (!resolved || !resolved.isEnabled || !resolved.provider.isEnabled) {
      return null;
    }
    return {
      configId: resolved.id,
      modelId: resolved.modelId,
      protocol: resolved.provider.apiProtocol,
      baseUrl: (
        resolved.provider.baseUrl ?? resolved.provider.defaultBaseUrl
      )?.replace(/\/+$/, ''),
      providerSlug: resolved.provider.slug,
      apiKeyId: resolved.provider.apiKeyId,
      organizationId: resolved.provider.orgId,
    };
  }

  async generate(
    tenantId: string,
    model: ResolvedImageModel,
    input: ImageGenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedImage[]> {
    const isOpenAi =
      model.protocol === 'openai_chat' || model.protocol === 'openai_responses';
    if (!isOpenAi && model.protocol !== 'google') {
      throw new ImageGenerationUnsupportedProtocolException(model.protocol);
    }
    if (!model.baseUrl) {
      throw new ImageGenerationFailedException(
        `图像模型提供商 ${model.providerSlug} 未配置 baseUrl`,
      );
    }

    const apiKey = await runInTenantTransaction(this.db, tenantId, () =>
      this.decryptionBoundaryService.decryptConfiguredApiKey(
        {
          apiKeyId: model.apiKeyId,
          organizationId: model.organizationId,
          tenantId,
          provider: model.providerSlug,
        },
        'ImageGenerationService.generate',
      ),
    );
    const requestSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
    ]);

    return isOpenAi
      ? this.generateWithOpenAi(
          model.baseUrl,
          model.modelId,
          apiKey,
          input,
          requestSignal,
        )
      : this.generateWithGemini(
          model.baseUrl,
          model.modelId,
          apiKey,
          input,
          requestSignal,
        );
  }

  private async generateWithOpenAi(
    baseUrl: string,
    modelId: string,
    apiKey: string,
    input: ImageGenerationInput,
    signal: AbortSignal,
  ): Promise<GeneratedImage[]> {
    const body: Record<string, unknown> = {
      model: modelId,
      prompt: input.prompt,
      n: 1,
      size: input.size,
    };
    // gpt-image 系列始终返回 b64_json 且不接受 response_format；dall-e 默认返回 URL
    if (modelId.startsWith('dall-e')) {
      body.response_format = 'b64_json';
    }
    const payload = await this.postJson(
      `${appendTerminalPath(baseUrl, '/v1')}/images/generations`,
      { Authorization: `Bearer ${apiKey}` },
      body,
      signal,
    );
    const first = Array.isArray(payload.data)
      ? (payload.data[0] as Record<string, unknown> | undefined)
      : undefined;
    const outputFormat =
      typeof payload.output_format === 'string'
        ? OUTPUT_FORMAT_MEDIA_TYPES[payload.output_format.toLowerCase()]
        : undefined;

    if (typeof first?.b64_json === 'string') {
      const data = Buffer.from(first.b64_json, 'base64');
      return [{ data, mediaType: outputFormat ?? sniffMediaType(data) }];
    }
    if (typeof first?.url === 'string') {
      const data = await this.download(first.url, signal);
      return [{ data, mediaType: outputFormat ?? sniffMediaType(data) }];
    }
    throw new ImageGenerationFailedException('模型未返回图片');
  }

  private async generateWithGemini(
    baseUrl: string,
    modelId: string,
    apiKey: string,
    input: ImageGenerationInput,
    signal: AbortSignal,
  ): Promise<GeneratedImage[]> {
    // baseUrl 已带版本段（/v1beta 或 /v1）时原样使用，否则补 /v1beta
    const versionedBaseUrl =
      hasTerminalPath(baseUrl, '/v1beta') || hasTerminalPath(baseUrl, '/v1')
        ? baseUrl
        : appendTerminalPath(baseUrl, '/v1beta');
    const payload = await this.postJson(
      `${versionedBaseUrl}/models/${encodeURIComponent(modelId)}:generateContent`,
      { 'x-goog-api-key': apiKey },
      {
        contents: [
          {
            parts: [
              {
                text: `${input.prompt}\n\nAspect ratio: ${GEMINI_ASPECT_RATIOS[input.size]}`,
              },
            ],
          },
        ],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      },
      signal,
    );

    const candidate = Array.isArray(payload.candidates)
      ? (payload.candidates[0] as Record<string, unknown> | undefined)
      : undefined;
    const content = candidate?.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const images: GeneratedImage[] = [];
    for (const part of parts as Array<Record<string, unknown>>) {
      const inline = (part.inlineData ?? part.inline_data) as
        { mimeType?: unknown; mime_type?: unknown; data?: unknown } | undefined;
      if (typeof inline?.data !== 'string') {
        continue;
      }
      const data = Buffer.from(inline.data, 'base64');
      const mimeType = inline.mimeType ?? inline.mime_type;
      const declared =
        typeof mimeType === 'string'
          ? OUTPUT_FORMAT_MEDIA_TYPES[mimeType.replace(/^image\//, '')]
          : undefined;
      images.push({ data, mediaType: declared ?? sniffMediaType(data) });
    }
    if (images.length === 0) {
      throw new ImageGenerationFailedException('模型未返回图片');
    }
    return images;
  }

  private async postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const response = await this.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      },
      signal,
    );
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new ImageGenerationFailedException('图像模型返回了无法解析的响应');
    }
  }

  private async download(url: string, signal: AbortSignal): Promise<Buffer> {
    const response = await this.request(url, { method: 'GET' }, signal);
    return Buffer.from(await response.arrayBuffer());
  }

  private async request(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal });
    } catch (error) {
      throw new ImageGenerationFailedException(
        error instanceof Error && error.name === 'TimeoutError'
          ? `图像模型请求超时（${IMAGE_GENERATION_TIMEOUT_MS / 1000}s）`
          : `图像模型请求失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ImageGenerationFailedException(
        `${response.status} ${text.slice(0, ERROR_BODY_SNIPPET_MAX)}`.trim(),
      );
    }
    return response;
  }
}

/** 按文件头判定图片类型；无法识别时按 PNG 处理 */
function sniffMediaType(data: Buffer): GeneratedImageMediaType {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/png';
}
