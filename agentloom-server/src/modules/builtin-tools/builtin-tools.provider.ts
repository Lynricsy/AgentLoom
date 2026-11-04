import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { jsonSchema, tool, type ToolSet } from 'ai';

import { DomainException } from '../../common/exceptions/domain.exception';
import { StorageService } from '../../infrastructure/storage/storage.service';
import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type { AgentBuiltinToolPolicy } from '../agent-definition/agent-runtime-config.interface';
import { ImageGenerationService } from './image-generation/image-generation.service';
import {
  IMAGE_GENERATION_SIZES,
  type GeneratedImage,
  type GeneratedImageMediaType,
  type ImageGenerationSize,
  type ResolvedImageModel,
} from './image-generation/image-generation.types';
import {
  formatWebSearchFailures,
  WebSearchUnavailableException,
} from './web-search/web-search.exceptions';
import { WebSearchService } from './web-search/web-search.service';
import {
  WEB_SEARCH_RECENCIES,
  type WebSearchOutcome,
  type WebSearchRecency,
} from './web-search/web-search.types';

export const WEB_SEARCH_TOOL_NAME = 'web_search';
export const GENERATE_IMAGE_TOOL_NAME = 'generate_image';

const WEB_SEARCH_QUERY_MAX_CHARS = 500;
const WEB_SEARCH_DEFAULT_LIMIT = 8;
const WEB_SEARCH_MAX_LIMIT = 20;

const WEB_SEARCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search query.',
      minLength: 1,
      maxLength: WEB_SEARCH_QUERY_MAX_CHARS,
    },
    recency: {
      type: 'string',
      enum: [...WEB_SEARCH_RECENCIES],
      description: 'Only return pages from the last day/week/month/year.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: WEB_SEARCH_MAX_LIMIT,
      default: WEB_SEARCH_DEFAULT_LIMIT,
      description: `Maximum number of sources (1-${WEB_SEARCH_MAX_LIMIT}, default ${WEB_SEARCH_DEFAULT_LIMIT}).`,
    },
  },
  required: ['query'],
  additionalProperties: false,
} satisfies Parameters<typeof jsonSchema>[0];

interface WebSearchToolInput {
  query?: unknown;
  recency?: unknown;
  limit?: unknown;
}

const IMAGE_PROMPT_MAX_CHARS = 4000;
const IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;
/** no_sandbox 交付的预签名下载 URL 有效期（24 小时） */
const IMAGE_URL_EXPIRY_SECONDS = 24 * 60 * 60;

const IMAGE_FILE_EXTENSIONS: Record<GeneratedImageMediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const GENERATE_IMAGE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'Detailed description of the image to generate.',
      minLength: 1,
      maxLength: IMAGE_PROMPT_MAX_CHARS,
    },
    size: {
      type: 'string',
      enum: [...IMAGE_GENERATION_SIZES],
      default: '1024x1024',
      description: 'Image size: square, landscape or portrait.',
    },
    file_name: {
      type: 'string',
      pattern: IMAGE_FILE_NAME_PATTERN.source,
      description:
        'Optional file name under /workspace/generated/ (sandbox sessions only), e.g. fox.png.',
    },
  },
  required: ['prompt'],
  additionalProperties: false,
} satisfies Parameters<typeof jsonSchema>[0];

interface GenerateImageToolInput {
  prompt?: unknown;
  size?: unknown;
  file_name?: unknown;
}

export interface BuiltinToolSetParams {
  sessionId: string;
  tenantId: string;
  /** 会话 runtimeConfig.builtinToolPolicy；缺省全部启用 */
  policy?: AgentBuiltinToolPolicy;
  /** sandbox 会话结果经远程工具回调内联回 guest（inline），no_sandbox 会话落对象存储（storage） */
  delivery: 'inline' | 'storage';
}

export interface BuiltinToolsRegistration extends BuiltinToolSetParams {
  runtime: IAgentRuntime;
}

/**
 * 服务端内置工具（两种运行态共用一份实现）：以 SessionToolProvider 注册到会话；
 * sandbox 会话经既有远程工具回调抵达 guest。
 */
@Injectable()
export class BuiltinToolsProvider {
  private readonly logger = new Logger(BuiltinToolsProvider.name);

  constructor(
    private readonly webSearchService: WebSearchService,
    private readonly imageGenerationService: ImageGenerationService,
    private readonly storageService: StorageService,
  ) {}

  async register(params: BuiltinToolsRegistration): Promise<void> {
    const { runtime, ...toolSetParams } = params;
    if (!runtime.registerSessionToolProvider) {
      return;
    }
    const tools = await this.buildToolSet(toolSetParams);
    if (Object.keys(tools).length === 0) {
      return;
    }
    runtime.registerSessionToolProvider(params.sessionId, () => tools);
  }

  async buildToolSet(params: BuiltinToolSetParams): Promise<ToolSet> {
    const tools: ToolSet = {};
    if (params.policy?.webSearchEnabled !== false) {
      tools[WEB_SEARCH_TOOL_NAME] = this.createWebSearchTool();
    }
    const imageModel =
      params.policy?.imageGenerationEnabled === false
        ? null
        : await this.resolveImageModel(params.tenantId);
    if (imageModel) {
      tools[GENERATE_IMAGE_TOOL_NAME] = this.createGenerateImageTool(
        params,
        imageModel,
      );
    }
    return tools;
  }

  /** 解析失败只影响 generate_image，不阻断会话创建 */
  private async resolveImageModel(
    tenantId: string,
  ): Promise<ResolvedImageModel | null> {
    try {
      const model =
        await this.imageGenerationService.resolveTenantImageModel(tenantId);
      if (!model) {
        this.logger.debug(
          `Tenant ${tenantId} has no enabled default image model; generate_image not registered`,
        );
      }
      return model;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve default image model for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private createGenerateImageTool(
    params: BuiltinToolSetParams,
    model: ResolvedImageModel,
  ) {
    return tool({
      description:
        params.delivery === 'inline'
          ? "Generate an image from a prompt with the organization's default image model. The file is saved under /workspace/generated/ and returned to you as an image when your model accepts images."
          : "Generate an image from a prompt with the organization's default image model. Returns a download URL valid for 24 hours.",
      inputSchema: jsonSchema(GENERATE_IMAGE_INPUT_SCHEMA),
      execute: (input, options) =>
        this.executeGenerateImage(
          params,
          model,
          input as GenerateImageToolInput,
          options.abortSignal,
        ),
    });
  }

  private async executeGenerateImage(
    params: BuiltinToolSetParams,
    model: ResolvedImageModel,
    input: GenerateImageToolInput,
    signal: AbortSignal | undefined,
  ): Promise<Record<string, unknown>> {
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!prompt) {
      return { error: 'prompt is required' };
    }
    if (prompt.length > IMAGE_PROMPT_MAX_CHARS) {
      return {
        error: `prompt exceeds ${IMAGE_PROMPT_MAX_CHARS} characters`,
      };
    }
    const size = IMAGE_GENERATION_SIZES.includes(
      input.size as ImageGenerationSize,
    )
      ? (input.size as ImageGenerationSize)
      : '1024x1024';
    const fileName =
      typeof input.file_name === 'string' && input.file_name.trim()
        ? input.file_name.trim()
        : undefined;
    if (fileName !== undefined && !IMAGE_FILE_NAME_PATTERN.test(fileName)) {
      return {
        error: `file_name must match ${IMAGE_FILE_NAME_PATTERN.source}`,
      };
    }

    try {
      const images = await this.imageGenerationService.generate(
        params.tenantId,
        model,
        { prompt, size },
        signal,
      );
      return params.delivery === 'inline'
        ? {
            model: model.modelId,
            __agentloomImages: images.map((image, index) => ({
              fileName: buildImageFileName(fileName, image.mediaType, index),
              mediaType: image.mediaType,
              base64: image.data.toString('base64'),
            })),
          }
        : {
            model: model.modelId,
            images: await Promise.all(
              images.map((image) => this.storeImage(params, image)),
            ),
          };
    } catch (error) {
      return {
        error:
          error instanceof DomainException
            ? error.detail
            : error instanceof Error
              ? error.message
              : String(error),
      };
    }
  }

  private async storeImage(
    params: BuiltinToolSetParams,
    image: GeneratedImage,
  ): Promise<Record<string, unknown>> {
    const storageKey = `tenants/${params.tenantId}/generated-images/${params.sessionId}/${randomUUID()}.${IMAGE_FILE_EXTENSIONS[image.mediaType]}`;
    await this.storageService.upload(
      storageKey,
      image.data,
      image.data.length,
      image.mediaType,
    );
    return {
      url: await this.storageService.getPresignedUrl(
        storageKey,
        IMAGE_URL_EXPIRY_SECONDS,
      ),
      storageKey,
      mediaType: image.mediaType,
      bytes: image.data.length,
    };
  }

  private createWebSearchTool() {
    return tool({
      description:
        "Search the web and return ranked sources with snippets; use it for current facts, docs and URLs you don't know.",
      inputSchema: jsonSchema(WEB_SEARCH_INPUT_SCHEMA),
      execute: (input, options) =>
        this.executeWebSearch(input as WebSearchToolInput, options.abortSignal),
    });
  }

  private async executeWebSearch(
    input: WebSearchToolInput,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) {
      return 'web search failed: query is required';
    }
    if (query.length > WEB_SEARCH_QUERY_MAX_CHARS) {
      return `web search failed: query exceeds ${WEB_SEARCH_QUERY_MAX_CHARS} characters`;
    }
    const recency = WEB_SEARCH_RECENCIES.includes(
      input.recency as WebSearchRecency,
    )
      ? (input.recency as WebSearchRecency)
      : undefined;
    const limit =
      typeof input.limit === 'number' && Number.isFinite(input.limit)
        ? Math.min(WEB_SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(input.limit)))
        : WEB_SEARCH_DEFAULT_LIMIT;

    try {
      const outcome = await this.webSearchService.search({
        query,
        recency,
        limit,
        signal,
      });
      return formatWebSearchOutcome(outcome);
    } catch (error) {
      if (error instanceof WebSearchUnavailableException) {
        return `web search failed: ${
          error.failures.length > 0
            ? formatWebSearchFailures(error.failures)
            : error.detail
        }`;
      }
      throw error;
    }
  }
}

export function formatWebSearchOutcome(outcome: WebSearchOutcome): string {
  const lines = [`Provider: ${outcome.provider}`];
  if (outcome.failures.length > 0) {
    lines.push(
      `Note: answered by ${outcome.provider} after ${outcome.failures
        .map((failure) => failure.id)
        .join(', ')} failed (${formatWebSearchFailures(outcome.failures)})`,
    );
  }
  if (outcome.answer) {
    lines.push('', '## Answer', outcome.answer.trim());
  }
  lines.push('', `## Sources (${outcome.results.length})`);
  outcome.results.forEach((result, index) => {
    lines.push(`[${index + 1}] ${result.title}`, `    ${result.url}`);
    if (result.snippet) {
      lines.push(`    ${result.snippet}`);
    }
  });
  return lines.join('\n');
}

/**
 * sandbox 交付的文件名：缺省 `image-<unix ms>.<ext>`；一次返回多张时从第二张起在扩展名前加 `-<n>`。
 * guest 落盘时遇同名文件会再追加序号，这里只保证同一批次内不重名。
 */
function buildImageFileName(
  requested: string | undefined,
  mediaType: GeneratedImageMediaType,
  index: number,
): string {
  const base =
    requested ?? `image-${Date.now()}.${IMAGE_FILE_EXTENSIONS[mediaType]}`;
  if (index === 0) {
    return base;
  }
  const dot = base.lastIndexOf('.');
  return dot > 0
    ? `${base.slice(0, dot)}-${index + 1}${base.slice(dot)}`
    : `${base}-${index + 1}`;
}
