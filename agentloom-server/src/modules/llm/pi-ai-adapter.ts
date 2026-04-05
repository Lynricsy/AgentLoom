import { Injectable, Logger } from '@nestjs/common';
import type { Api as PiApi, Model as PiModel } from '@mariozechner/pi-ai';

import type { LlmModelConfig } from '../../database/schema/llm-model-configs.schema';
import type { LlmProvider } from '../../database/schema/llm-providers.schema';
import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import { PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER } from './private-cloud-auth.constants';
import { LlmProviderException, LlmTimeoutException } from './llm.exceptions';
import {
  resolvePiModelApi,
  resolvePiModelBaseUrl,
  resolvePiProviderCompat,
} from '../sandbox/pi-config-generator.service';

const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1_000;
const RETRYABLE_MODEL_METHODS = new Set(['doGenerate', 'doStream']);

/**
 * 解析后的模型配置：模型配置 + 关联的提供商信息
 */
export type ResolvedModelConfig = LlmModelConfig & { provider: LlmProvider };

export type PiRuntimeResolvedModel = {
  model: PiModel<PiApi>;
  apiKey?: string;
};

interface LanguageModelProvider {
  (modelId: string, options?: Record<string, unknown>): unknown;
}

type WrappableModel = Record<PropertyKey, unknown>;

@Injectable()
export class PiAiAdapter {
  private readonly logger = new Logger(PiAiAdapter.name);

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
  ) {}

  async getModel(
    config: ResolvedModelConfig,
    apiKey?: string,
  ): Promise<unknown> {
    const providerSlug = config.provider.slug;

    // 仅在提供商配置了 apiKeyId 时解密 key
    const resolvedApiKey = !config.provider.apiKeyId
      ? undefined
      : (apiKey ?? (await this.resolveApiKey(config)));

    const sdkProvider = await this.resolveProvider(
      providerSlug,
      resolvedApiKey,
      config,
    );

    const timeout = config.timeoutMs ?? TIMEOUT_MS;

    return this.wrapModelWithRetry(
      sdkProvider(config.modelId),
      providerSlug,
      timeout,
    );
  }

  async getPiRuntimeModel(
    config: ResolvedModelConfig,
    apiKey?: string,
  ): Promise<PiRuntimeResolvedModel> {
    const providerSlug = config.provider.slug;
    const apiBaseUrl =
      config.provider.baseUrl ?? config.provider.defaultBaseUrl ?? undefined;
    const resolvedApiKey = !config.provider.apiKeyId
      ? undefined
      : (apiKey ?? (await this.resolveApiKey(config)));

    const api = resolvePiModelApi({
      provider: providerSlug,
      model: config.modelId,
      apiProtocol: config.provider.apiProtocol,
    });
    const baseUrl =
      resolvePiModelBaseUrl(
        {
          provider: providerSlug,
          model: config.modelId,
          apiBaseUrl,
        },
        api,
      ) ?? '';

    const compat = resolvePiProviderCompat(
      {
        provider: providerSlug,
        model: config.modelId,
        apiBaseUrl,
      },
      api,
    );

    const model: PiModel<PiApi> = {
      id: config.modelId,
      name: config.name,
      api: api as PiApi,
      provider: providerSlug,
      baseUrl,
      reasoning: true,
      input: ['text', 'image'],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: config.contextWindow ?? 0,
      maxTokens: config.maxOutputTokens ?? 4096,
      ...(compat ? { compat } : {}),
      ...(!config.provider.apiKeyId && providerSlug === 'private_cloud'
        ? { headers: { Authorization: '' } }
        : {}),
    };

    return {
      model,
      ...(resolvedApiKey
        ? { apiKey: resolvedApiKey }
        : !config.provider.apiKeyId && providerSlug === 'private_cloud'
          ? { apiKey: PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER }
          : {}),
    };
  }

  private async resolveProvider(
    providerSlug: string,
    apiKey: string | undefined,
    config: ResolvedModelConfig,
  ): Promise<LanguageModelProvider> {
    const baseUrl = config.provider.baseUrl ?? config.provider.defaultBaseUrl;
    const protocol = config.provider.apiProtocol;
    const requiresAuth = !!config.provider.apiKeyId;

    switch (protocol) {
      case 'openai_chat': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({
          apiKey: apiKey ?? PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER,
          ...(baseUrl && { baseURL: baseUrl }),
          ...(!requiresAuth && {
            fetch: this.createAuthorizationStrippingFetch(),
          }),
        });
        // 使用 .chat() 强制走 Chat Completions API
        return (modelId: string) => provider.chat(modelId);
      }
      case 'openai_responses': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({
          apiKey: apiKey ?? PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER,
          ...(baseUrl && { baseURL: baseUrl }),
          ...(!requiresAuth && {
            fetch: this.createAuthorizationStrippingFetch(),
          }),
        });
        // 默认调用走 Responses API
        return (modelId: string) => provider.responses(modelId);
      }
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({
          apiKey: apiKey!,
          ...(baseUrl && { baseURL: baseUrl }),
        });
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        return createGoogleGenerativeAI({
          apiKey: apiKey!,
          ...(baseUrl && { baseURL: baseUrl }),
        });
      }
      case 'cohere': {
        // Cohere 支持 OpenAI 兼容端点，使用 createOpenAI + .chat() 走 Chat Completions
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({
          apiKey: apiKey!,
          ...(baseUrl && { baseURL: baseUrl }),
        });
        return (modelId: string) => provider.chat(modelId);
      }
      default:
        throw new LlmProviderException(
          providerSlug,
          `不支持的 API 协议: ${protocol}`,
        );
    }
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T> | T,
    provider: string,
    timeout = TIMEOUT_MS,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.withTimeout(
          Promise.resolve().then(fn),
          timeout,
          provider,
        );
      } catch (error) {
        lastError = error;

        if (error instanceof LlmTimeoutException) {
          if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            this.logger.warn(
              `LLM 提供商 ${provider} 超时，第 ${attempt + 1} 次重试，等待 ${delay}ms`,
            );
            await this.sleep(delay);
            continue;
          }
          throw error;
        }

        if (this.isRetryableError(error)) {
          if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            this.logger.warn(
              `LLM 提供商 ${provider} 返回 5xx，第 ${attempt + 1} 次重试，等待 ${delay}ms`,
            );
            await this.sleep(delay);
            continue;
          }
        }

        throw this.wrapError(error, provider);
      }
    }

    throw this.wrapError(lastError, provider);
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    provider: string,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new LlmTimeoutException(provider));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof LlmProviderException) return false;
    const statusCode =
      (error as { status?: number; statusCode?: number })?.status ??
      (error as { status?: number; statusCode?: number })?.statusCode;
    if (statusCode === 401 || statusCode === 403) return false;
    return statusCode !== undefined && statusCode >= 500;
  }

  private wrapError(error: unknown, provider: string): never {
    if (
      error instanceof LlmTimeoutException ||
      error instanceof LlmProviderException
    ) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      (error as { status?: number; statusCode?: number })?.status ??
      (error as { status?: number; statusCode?: number })?.statusCode;

    throw new LlmProviderException(
      provider,
      message,
      statusCode === 401 || statusCode === 403
        ? { authenticationFailed: true }
        : undefined,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createAuthorizationStrippingFetch(): typeof fetch {
    return async (input, init) => {
      const headers = new Headers(
        input instanceof Request
          ? (init?.headers ?? input.headers)
          : init?.headers,
      );

      headers.delete('authorization');

      return fetch(input, {
        ...init,
        headers,
      });
    };
  }

  private async resolveApiKey(config: ResolvedModelConfig): Promise<string> {
    return this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: config.provider.apiKeyId,
        organizationId: config.orgId,
        tenantId: config.tenantId,
        provider: config.provider.slug,
      },
      PiAiAdapter.name,
    );
  }

  private wrapModelWithRetry(
    model: unknown,
    provider: string,
    timeout = TIMEOUT_MS,
  ): unknown {
    if (!this.isWrappableModel(model)) {
      return model;
    }

    return new Proxy(model, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);

        if (typeof value !== 'function' || !this.shouldWrapMethod(property)) {
          return value;
        }

        return (...args: unknown[]) =>
          this.executeWithRetry(
            () => Reflect.apply(value, target, args),
            provider,
            timeout,
          );
      },
    });
  }

  private isWrappableModel(model: unknown): model is WrappableModel {
    return typeof model === 'object' && model !== null;
  }

  private shouldWrapMethod(property: PropertyKey): boolean {
    return (
      typeof property === 'string' && RETRYABLE_MODEL_METHODS.has(property)
    );
  }
}
