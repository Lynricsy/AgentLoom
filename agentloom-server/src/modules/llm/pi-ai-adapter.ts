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

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
  ) {}

  async getModel(
    config: LlmModelConfig,
    apiKey?: string,
  ): Promise<unknown> {
    const resolvedApiKey = apiKey ?? (await this.resolveApiKey(config));
    const provider = await this.resolveProvider(
      config.provider,
      resolvedApiKey,
      config.parameters,
    );

    return this.wrapModelWithRetry(provider(config.modelName), config.provider);
  }

  private async resolveProvider(
    providerName: string,
    apiKey: string,
    parameters: unknown,
  ): Promise<LanguageModelProvider> {
    const baseUrl = (parameters as Record<string, unknown>)?.baseUrl as
      | string
      | undefined;

    switch (providerName) {
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({ apiKey, ...(baseUrl && { baseURL: baseUrl }) });
      }
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({
          apiKey,
          ...(baseUrl && { baseURL: baseUrl }),
        });
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import(
          '@ai-sdk/google'
        );
        return createGoogleGenerativeAI({
          apiKey,
          ...(baseUrl && { baseURL: baseUrl }),
        });
      }
      case 'deepseek': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({
          apiKey,
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
        return createOpenAI({ apiKey, baseURL: baseUrl });
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
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.withTimeout(
          Promise.resolve().then(fn),
          TIMEOUT_MS,
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
    return statusCode !== undefined && statusCode >= 500;
  }

  private wrapError(error: unknown, provider: string): never {
    if (
      error instanceof LlmTimeoutException ||
      error instanceof LlmProviderException
    ) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : String(error);
    throw new LlmProviderException(provider, message);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  private wrapModelWithRetry(model: unknown, provider: string): unknown {
    if (!this.isWrappableModel(model)) {
      return model;
    }

    return new Proxy(model, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);

        if (
          typeof value !== 'function' ||
          !this.shouldWrapMethod(property)
        ) {
          return value;
        }

        return (...args: unknown[]) =>
          this.executeWithRetry(
            () => Reflect.apply(value, target, args),
            provider,
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
