import { Injectable, Logger } from '@nestjs/common';
import type { Api as PiApi, Model as PiModel } from '@earendil-works/pi-ai';

import type { LlmModelConfig } from '../../database/schema/llm-model-configs.schema';
import type { LlmProvider } from '../../database/schema/llm-providers.schema';
import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import { PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER } from './private-cloud-auth.constants';
import { LlmProviderException, LlmTimeoutException } from './llm.exceptions';
import {
  resolvePiModelApi,
  resolvePiModelBaseUrl,
  resolvePiProviderApiKeyEnv,
  resolvePiProviderCompat,
} from '../sandbox/pi-config-generator.service';

const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1_000;
const RETRYABLE_MODEL_METHODS = new Set(['doGenerate', 'doStream']);
const ANONYMOUS_REQUEST_PROVIDER_SLUGS = new Set([
  'private_cloud',
  'custom',
  'ollama',
]);

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

type ResolvedApiSettings = {
  api: string;
  rawProtocol?: string;
};

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

    const resolvedApiKey = await this.resolveConfiguredApiKey(config, apiKey);

    const apiSettings = this.resolveApiSettings(config);
    const sdkProvider = await this.resolveProvider({
      providerSlug,
      apiKey: resolvedApiKey,
      requiresAuth: !!config.provider.apiKeyId,
      rawProtocol: apiSettings.rawProtocol,
      api: apiSettings.api,
      baseUrl: this.resolveSdkBaseUrl(config, apiSettings.api),
    });

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
    const resolvedApiKey = await this.resolveConfiguredApiKey(config, apiKey);
    const apiSettings = this.resolveApiSettings(config);
    const runtimeBaseUrl = this.resolveRuntimeBaseUrl(config, apiSettings.api);

    const compat = resolvePiProviderCompat(
      {
        provider: providerSlug,
        model: config.modelId,
        apiBaseUrl: runtimeBaseUrl,
      },
      apiSettings.api,
    );

    const model: PiModel<PiApi> = {
      id: config.modelId,
      name: config.name,
      api: apiSettings.api as PiApi,
      provider: providerSlug,
      baseUrl: runtimeBaseUrl ?? '',
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
        : this.isAnonymousRequestMode({
              providerSlug,
              apiKey: resolvedApiKey,
              requiresAuth: !!config.provider.apiKeyId,
            })
          ? { apiKey: PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER }
          : {}),
    };
  }

  private async resolveProvider(params: {
    providerSlug: string;
    apiKey: string | undefined;
    requiresAuth: boolean;
    api: string;
    baseUrl?: string;
    rawProtocol?: string;
  }): Promise<LanguageModelProvider> {
    const anonymousRequestMode = this.isAnonymousRequestMode(params);

    switch (params.api) {
      case 'openai-completions': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({
          ...(params.apiKey ? { apiKey: params.apiKey } : {}),
          ...(!params.apiKey && anonymousRequestMode
            ? { apiKey: PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER }
            : {}),
          ...(params.baseUrl && { baseURL: params.baseUrl }),
          ...(anonymousRequestMode && {
            fetch: this.createHeaderStrippingFetch(['authorization']),
          }),
        });
        // 使用 .chat() 强制走 Chat Completions API
        return (modelId: string) => provider.chat(modelId);
      }
      case 'openai-responses':
      case 'azure-openai-responses': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({
          ...(params.apiKey ? { apiKey: params.apiKey } : {}),
          ...(!params.apiKey && anonymousRequestMode
            ? { apiKey: PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER }
            : {}),
          ...(params.baseUrl && { baseURL: params.baseUrl }),
          ...(anonymousRequestMode && {
            fetch: this.createHeaderStrippingFetch(['authorization']),
          }),
        });
        // 默认调用走 Responses API
        return (modelId: string) => provider.responses(modelId);
      }
      case 'anthropic-messages': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({
          ...(params.apiKey ? { apiKey: params.apiKey } : {}),
          ...(!params.apiKey && anonymousRequestMode
            ? { apiKey: PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER }
            : {}),
          ...(params.baseUrl && { baseURL: params.baseUrl }),
          ...(anonymousRequestMode && {
            fetch: this.createHeaderStrippingFetch([
              'authorization',
              'x-api-key',
            ]),
          }),
        });
      }
      case 'google-generative-ai': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        return createGoogleGenerativeAI({
          apiKey: params.apiKey!,
          ...(params.baseUrl && { baseURL: params.baseUrl }),
        });
      }
      default:
        throw new LlmProviderException(
          params.providerSlug,
          `不支持的 API 协议: ${params.rawProtocol ?? params.api}`,
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

  private createHeaderStrippingFetch(headersToStrip: string[]): typeof fetch {
    return async (input, init) => {
      const headers = new Headers(
        input instanceof Request
          ? (init?.headers ?? input.headers)
          : init?.headers,
      );

      for (const headerName of headersToStrip) {
        headers.delete(headerName);
      }

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

  private async resolveConfiguredApiKey(
    config: ResolvedModelConfig,
    apiKey?: string,
  ): Promise<string | undefined> {
    if (apiKey) {
      return apiKey;
    }

    if (config.provider.apiKeyId) {
      return this.resolveApiKey(config);
    }

    return this.resolveEnvironmentApiKey(config.provider.slug);
  }

  private resolveEnvironmentApiKey(providerSlug: string): string | undefined {
    const envName = resolvePiProviderApiKeyEnv({ provider: providerSlug });
    if (!envName) {
      return undefined;
    }

    return this.normalizeOptionalString(process.env[envName]);
  }

  private resolveApiSettings(config: ResolvedModelConfig): ResolvedApiSettings {
    const rawProtocol =
      typeof config.provider.apiProtocol === 'string'
        ? config.provider.apiProtocol
        : undefined;
    const api = resolvePiModelApi({
      provider: config.provider.slug,
      model: config.modelId,
      apiProtocol: rawProtocol,
    });

    return { api, rawProtocol };
  }

  private resolveRuntimeBaseUrl(
    config: ResolvedModelConfig,
    api: string,
  ): string | undefined {
    const apiBaseUrl = this.resolveConfiguredApiBaseUrl(config);
    return resolvePiModelBaseUrl(
      {
        provider: config.provider.slug,
        model: config.modelId,
        apiBaseUrl,
      },
      api,
    );
  }

  private resolveSdkBaseUrl(
    config: ResolvedModelConfig,
    api: string,
  ): string | undefined {
    const configuredBaseUrl = this.resolveConfiguredApiBaseUrl(config);
    if (!configuredBaseUrl) {
      return undefined;
    }

    switch (api) {
      case 'anthropic-messages':
        return this.appendTerminalPath(configuredBaseUrl, '/v1');
      case 'google-generative-ai':
        return this.appendTerminalPath(configuredBaseUrl, '/v1beta');
      default:
        return this.appendTerminalPath(configuredBaseUrl, '/v1');
    }
  }

  private resolveConfiguredApiBaseUrl(
    config: ResolvedModelConfig,
  ): string | undefined {
    const providerBaseUrl = this.normalizeOptionalString(
      config.provider.baseUrl ?? config.provider.defaultBaseUrl,
    );
    if (providerBaseUrl) {
      return providerBaseUrl;
    }

    const parameters =
      config.parameters &&
      typeof config.parameters === 'object' &&
      !Array.isArray(config.parameters)
        ? (config.parameters as Record<string, unknown>)
        : {};

    for (const candidate of [
      parameters.baseUrl,
      parameters.baseURL,
      parameters.apiBaseUrl,
      parameters.endpointUrl,
    ]) {
      const normalized = this.normalizeOptionalString(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private appendTerminalPath(baseUrl: string, suffix: string): string {
    const trimmedBaseUrl = this.trimTrailingSlashes(baseUrl);
    const normalizedSuffix = this.trimTrailingSlashes(suffix).toLowerCase();
    if (trimmedBaseUrl.toLowerCase().endsWith(normalizedSuffix)) {
      return trimmedBaseUrl;
    }

    return `${trimmedBaseUrl}${suffix}`;
  }

  private trimTrailingSlashes(value: string): string {
    return value.replace(/\/+$/, '');
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

  private isAnonymousRequestMode(params: {
    providerSlug: string;
    apiKey?: string;
    requiresAuth: boolean;
  }): boolean {
    return (
      !params.requiresAuth &&
      !params.apiKey &&
      ANONYMOUS_REQUEST_PROVIDER_SLUGS.has(params.providerSlug)
    );
  }
}
