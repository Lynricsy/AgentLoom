import { Injectable, Logger } from '@nestjs/common';

import type { LlmModelConfig } from '../../database/schema/llm-model-configs.schema';
import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import { LlmProviderException, LlmTimeoutException } from './llm.exceptions';

const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1_000;
const RETRYABLE_MODEL_METHODS = new Set(['doGenerate', 'doStream']);

interface LanguageModelProvider {
  (modelId: string, options?: Record<string, unknown>): unknown;
}

type WrappableModel = Record<PropertyKey, unknown>;

@Injectable()
export class PiAiAdapter {
  private readonly logger = new Logger(PiAiAdapter.name);
  private static readonly PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER =
    '__agentloom_private_cloud_no_auth__';

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
  ) {}

  async getModel(config: LlmModelConfig, apiKey?: string): Promise<unknown> {
    // private_cloud: 仅 authMethod=api_key 时解密 key，否则跳过
    const resolvedApiKey =
      config.provider === 'private_cloud' && config.authMethod !== 'api_key'
        ? undefined
        : apiKey ?? (await this.resolveApiKey(config));

    const provider = await this.resolveProvider(
      config.provider,
      resolvedApiKey,
      config,
    );

    // private_cloud 使用配置的超时时间
    const timeout =
      config.provider === 'private_cloud'
        ? (config.timeoutMs ?? TIMEOUT_MS)
        : TIMEOUT_MS;

    return this.wrapModelWithRetry(
      provider(config.modelName),
      config.provider,
      timeout,
    );
  }

  private async resolveProvider(
    providerName: string,
    apiKey: string | undefined,
    config: LlmModelConfig,
  ): Promise<LanguageModelProvider> {
    const baseUrl = (config.parameters as Record<string, unknown>)?.baseUrl as
      | string
      | undefined;

    switch (providerName) {
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({
          apiKey: apiKey!,
          ...(baseUrl && { baseURL: baseUrl }),
        });
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
      case 'deepseek': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({
          apiKey: apiKey!,
          baseURL: baseUrl ?? 'https://api.deepseek.com/v1',
        });
      }
      case 'custom': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        if (!baseUrl) {
          throw new LlmProviderException(
            providerName,
            'Custom 提供商必须在 parameters 中指定 baseUrl',
          );
        }
        return createOpenAI({ apiKey: apiKey!, baseURL: baseUrl });
      }
      case 'private_cloud': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        if (!config.endpointUrl) {
          throw new LlmProviderException(
            providerName,
            'Private Cloud 提供商必须指定 endpointUrl',
          );
        }

        const requiresAuth = config.authMethod === 'api_key';
        return createOpenAI({
          apiKey:
            apiKey ?? PiAiAdapter.PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER,
          baseURL: config.endpointUrl,
          ...(requiresAuth
            ? {}
            : { fetch: this.createAuthorizationStrippingFetch() }),
        });
      }
      default:
        throw new LlmProviderException(
          providerName,
          `不支持的 LLM 提供商: ${providerName}`,
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
        input instanceof Request ? (init?.headers ?? input.headers) : init?.headers,
      );

      headers.delete('authorization');

      return fetch(input, {
        ...init,
        headers,
      });
    };
  }

  private async resolveApiKey(config: LlmModelConfig): Promise<string> {
    return this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: config.apiKeyId,
        organizationId: config.orgId,
        tenantId: config.tenantId,
        provider: config.provider,
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
