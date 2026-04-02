import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import type { LlmProvider } from '../../database/schema/llm-providers.schema';
import type {
  ModelCapabilities,
  ModelPricing,
} from '../../database/schema/llm-model-configs.schema';
import { LlmProviderException, LlmTimeoutException } from './llm.exceptions';

// ---------------------------------------------------------------------------
// 公开接口类型
// ---------------------------------------------------------------------------

export interface DiscoveredModel {
  id: string;
  name: string;
  ownedBy?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  serverInfo?: {
    version?: string;
    status?: string;
    models?: string[];
  };
}

export interface LiteLLMModelInfo {
  modelId: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  pricing: ModelPricing | null;
  capabilities: ModelCapabilities;
}

// ---------------------------------------------------------------------------
// 提供商 slug → LiteLLM litellm_provider 名称映射
// ---------------------------------------------------------------------------

const SLUG_TO_LITELLM_PROVIDERS: Record<string, string[]> = {
  openai: ['openai'],
  anthropic: ['anthropic'],
  google: ['vertex_ai-language-models', 'gemini'],
  deepseek: ['deepseek'],
  mistral: ['mistral'],
  groq: ['groq'],
  cohere: ['cohere_chat', 'cohere'],
};

/**
 * 不支持 OpenAI-compatible /v1/models 发现端点的 API 协议集合。
 * 这些协议的 discoverModels 直接返回空数组。
 */
const NON_OPENAI_COMPATIBLE_PROTOCOLS = new Set([
  'anthropic',
  'google',
  'cohere',
]);

// ---------------------------------------------------------------------------
// ModelDiscoveryService
// ---------------------------------------------------------------------------

@Injectable()
export class ModelDiscoveryService {
  private readonly logger = new Logger(ModelDiscoveryService.name);

  /** 内存缓存: LiteLLM JSON 数据 */
  private liteLLMCache: Record<string, unknown> | null = null;
  /** 缓存写入时间戳 */
  private liteLLMCacheTime = 0;

  /** 缓存有效期 24 小时 */
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  /** LiteLLM 模型元数据 JSON 地址 */
  private static readonly LITELLM_URL =
    'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
  /** searchLiteLLMModels 最大返回数量 */
  private static readonly SEARCH_RESULT_LIMIT = 100;

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
    private readonly configService: ConfigService,
  ) {}

  // =========================================================================
  // 公开方法
  // =========================================================================

  /**
   * 测试到提供商端点的连接。先尝试 /health，失败则回退到 /v1/models。
   */
  async testConnection(
    provider: LlmProvider,
    timeoutMs?: number,
  ): Promise<ConnectionTestResult> {
    const timeout = timeoutMs ?? 10_000;
    const baseUrl = this.resolveBaseUrl(provider);
    const headers = await this.buildProviderHeaders(provider);
    const start = Date.now();

    // 第一阶段: 尝试 /health
    try {
      const healthRes = await this.fetchWithTimeout(
        `${baseUrl}/health`,
        { headers },
        timeout,
      );

      this.checkAuthError(healthRes, provider.slug);

      if (healthRes.ok) {
        const serverInfo = await this.extractServerInfo(healthRes);
        return {
          success: true,
          latencyMs: Date.now() - start,
          ...(serverInfo ? { serverInfo } : {}),
        };
      }

      this.logger.debug(
        `/health 返回状态 ${healthRes.status}，尝试 /v1/models (provider=${provider.slug})`,
      );
    } catch (error) {
      if (
        error instanceof LlmProviderException ||
        error instanceof LlmTimeoutException
      ) {
        throw error;
      }
      this.logger.debug(
        `/health 端点不可用，尝试 /v1/models (provider=${provider.slug})`,
      );
    }

    // 第二阶段: 回退到 /v1/models
    try {
      const modelsRes = await this.fetchWithTimeout(
        `${baseUrl}/v1/models`,
        { headers },
        timeout,
      );

      this.checkAuthError(modelsRes, provider.slug);

      if (modelsRes.ok) {
        const serverInfo = await this.extractServerInfo(modelsRes);
        return {
          success: true,
          latencyMs: Date.now() - start,
          ...(serverInfo ? { serverInfo } : {}),
        };
      }

      throw new LlmProviderException(
        provider.slug,
        `端点返回状态码 ${modelsRes.status}`,
      );
    } catch (error) {
      if (
        error instanceof LlmProviderException ||
        error instanceof LlmTimeoutException
      ) {
        throw error;
      }
      throw new LlmProviderException(
        provider.slug,
        `无法连接到提供商端点: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 通过 /v1/models (OpenAI-compatible) 发现提供商的可用模型。
   * 对于 anthropic / google / cohere 协议直接返回空数组（它们不支持此端点）。
   */
  async discoverModels(provider: LlmProvider): Promise<DiscoveredModel[]> {
    if (NON_OPENAI_COMPATIBLE_PROTOCOLS.has(provider.apiProtocol)) {
      this.logger.debug(
        `提供商 ${provider.slug} (协议 ${provider.apiProtocol}) 不支持 /v1/models 发现，跳过`,
      );
      return [];
    }

    const baseUrl = this.resolveBaseUrl(provider);
    const headers = await this.buildProviderHeaders(provider);

    try {
      const res = await this.fetchWithTimeout(
        `${baseUrl}/v1/models`,
        { headers },
        15_000,
      );

      this.checkAuthError(res, provider.slug);

      if (!res.ok) {
        throw new LlmProviderException(
          provider.slug,
          `获取模型列表失败，状态码 ${res.status}`,
        );
      }

      const body = (await res.json()) as {
        data?: Array<{ id: string; owned_by?: string }>;
      };

      if (!body.data || !Array.isArray(body.data)) {
        return [];
      }

      return body.data.map((m) => ({
        id: m.id,
        name: m.id,
        ownedBy: m.owned_by ?? undefined,
      }));
    } catch (error) {
      if (
        error instanceof LlmProviderException ||
        error instanceof LlmTimeoutException
      ) {
        throw error;
      }
      throw new LlmProviderException(
        provider.slug,
        `无法获取模型列表: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 从 LiteLLM JSON 中查找指定模型的元数据。找不到时返回 null。
   */
  async lookupModelMetadata(
    providerSlug: string,
    modelId: string,
  ): Promise<LiteLLMModelInfo | null> {
    const data = await this.getLiteLLMData();
    const keys = this.buildLiteLLMKeys(providerSlug, modelId);

    for (const key of keys) {
      const entry = data[key];
      if (entry && typeof entry === 'object') {
        return this.parseLiteLLMEntry(key, entry as Record<string, unknown>);
      }
    }

    return null;
  }

  /**
   * 搜索 LiteLLM 元数据中匹配指定提供商 slug 的所有模型。
   * 最多返回 100 条结果。
   */
  async searchLiteLLMModels(providerSlug: string): Promise<LiteLLMModelInfo[]> {
    const data = await this.getLiteLLMData();
    const litellmProviders = SLUG_TO_LITELLM_PROVIDERS[providerSlug];

    if (!litellmProviders || litellmProviders.length === 0) {
      this.logger.debug(
        `提供商 ${providerSlug} 无对应的 LiteLLM provider 映射`,
      );
      return [];
    }

    const providerSet = new Set(litellmProviders);
    const results: LiteLLMModelInfo[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (results.length >= ModelDiscoveryService.SEARCH_RESULT_LIMIT) {
        break;
      }

      if (!value || typeof value !== 'object') {
        continue;
      }

      const entry = value as Record<string, unknown>;
      const entryProvider = entry.litellm_provider;

      if (typeof entryProvider === 'string' && providerSet.has(entryProvider)) {
        results.push(this.parseLiteLLMEntry(key, entry));
      }
    }

    return results;
  }

  // =========================================================================
  // 私有辅助方法
  // =========================================================================

  /**
   * 为提供商构建认证 headers。如果配置了 apiKeyId 则解密后注入。
   * anthropic 协议使用 x-api-key header，其他使用 Authorization: Bearer。
   */
  private async buildProviderHeaders(
    provider: LlmProvider,
  ): Promise<Record<string, string>> {
    if (!provider.apiKeyId) {
      return {};
    }

    const apiKey = await this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: provider.apiKeyId,
        organizationId: provider.orgId,
        tenantId: provider.tenantId,
        provider: provider.slug,
      },
      ModelDiscoveryService.name,
    );

    // Anthropic 使用 x-api-key 而非 Bearer token
    if (provider.apiProtocol === 'anthropic') {
      return {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    }

    return {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  /**
   * 解析提供商的有效 base URL：优先使用用户自定义 URL，回退到内置默认 URL。
   */
  private resolveBaseUrl(provider: LlmProvider): string {
    const url = provider.baseUrl ?? provider.defaultBaseUrl ?? '';
    return url.replace(/\/+$/, '');
  }

  /**
   * 带超时 + AbortController 的 fetch 封装。
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new LlmTimeoutException('provider', `连接超时 (${timeoutMs}ms)`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 检查 HTTP 401/403 认证错误并抛出结构化异常。
   */
  private checkAuthError(res: Response, providerSlug: string): void {
    if (res.status === 401 || res.status === 403) {
      throw new LlmProviderException(
        providerSlug,
        `认证失败 (${res.status})，请检查认证配置`,
        { authenticationFailed: true },
      );
    }
  }

  /**
   * 从 HTTP 响应中提取服务器信息（version / status / models 前 10 项）。
   */
  private async extractServerInfo(
    res: Response,
  ): Promise<ConnectionTestResult['serverInfo'] | undefined> {
    try {
      const body = (await res.json()) as {
        version?: unknown;
        status?: unknown;
        data?: Array<{ id?: unknown }>;
      };

      const serverInfo: NonNullable<ConnectionTestResult['serverInfo']> = {};

      if (typeof body.version === 'string') {
        serverInfo.version = body.version;
      }

      if (typeof body.status === 'string') {
        serverInfo.status = body.status;
      }

      if (Array.isArray(body.data)) {
        const models = body.data
          .flatMap((item) => (typeof item.id === 'string' ? [item.id] : []))
          .slice(0, 10);

        if (models.length > 0) {
          serverInfo.models = models;
        }
      }

      return Object.keys(serverInfo).length > 0 ? serverInfo : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 获取并缓存 LiteLLM JSON 数据（24 小时缓存）。
   * 获取失败时回退到已缓存数据，均无则返回空对象。
   */
  private async getLiteLLMData(): Promise<Record<string, unknown>> {
    const now = Date.now();

    if (
      this.liteLLMCache &&
      now - this.liteLLMCacheTime < ModelDiscoveryService.CACHE_TTL_MS
    ) {
      return this.liteLLMCache;
    }

    try {
      const res = await this.fetchWithTimeout(
        ModelDiscoveryService.LITELLM_URL,
        {},
        30_000,
      );

      if (!res.ok) {
        this.logger.warn(
          `获取 LiteLLM 元数据失败，状态码 ${res.status}，使用缓存数据`,
        );
        return this.liteLLMCache ?? {};
      }

      const data = (await res.json()) as Record<string, unknown>;
      this.liteLLMCache = data;
      this.liteLLMCacheTime = now;
      this.logger.debug(
        `LiteLLM 元数据缓存已更新，共 ${Object.keys(data).length} 个模型条目`,
      );
      return data;
    } catch (error) {
      // 超时和网络错误都静默回退
      this.logger.warn(
        `获取 LiteLLM 元数据失败: ${(error as Error).message}，使用缓存数据`,
      );
      return this.liteLLMCache ?? {};
    }
  }

  /**
   * 根据提供商 slug + 模型 ID 构建 LiteLLM 查找键列表（按优先级排序）。
   *
   * LiteLLM JSON 中条目的 key 格式不统一:
   * - 部分直接用模型 ID: "gpt-4o"
   * - 部分带 provider 前缀: "deepseek/deepseek-chat"
   *
   * 因此需要尝试多种组合。
   */
  private buildLiteLLMKeys(providerSlug: string, modelId: string): string[] {
    const keys: string[] = [];

    // 优先尝试直接模型 ID
    keys.push(modelId);

    // 然后尝试 provider/modelId 格式
    keys.push(`${providerSlug}/${modelId}`);

    // 如果 slug 与 litellm_provider 名称不同，也尝试 litellm 名称
    const litellmProviders = SLUG_TO_LITELLM_PROVIDERS[providerSlug];
    if (litellmProviders) {
      for (const lp of litellmProviders) {
        const prefixed = `${lp}/${modelId}`;
        if (!keys.includes(prefixed)) {
          keys.push(prefixed);
        }
      }
    }

    return keys;
  }

  /**
   * 将 LiteLLM JSON 条目解析为 LiteLLMModelInfo 结构。
   */
  private parseLiteLLMEntry(
    key: string,
    entry: Record<string, unknown>,
  ): LiteLLMModelInfo {
    const inputCost =
      typeof entry.input_cost_per_token === 'number'
        ? entry.input_cost_per_token
        : 0;
    const outputCost =
      typeof entry.output_cost_per_token === 'number'
        ? entry.output_cost_per_token
        : 0;
    const cachedReadCost =
      typeof entry.cache_read_input_token_cost === 'number'
        ? entry.cache_read_input_token_cost
        : null;
    const cachedWriteCost =
      typeof entry.cache_creation_input_token_cost === 'number'
        ? entry.cache_creation_input_token_cost
        : null;

    const pricing: ModelPricing = {
      inputPer1MTokens: inputCost * 1_000_000,
      outputPer1MTokens: outputCost * 1_000_000,
      ...(cachedReadCost !== null
        ? { cachedReadPer1MTokens: cachedReadCost * 1_000_000 }
        : {}),
      ...(cachedWriteCost !== null
        ? { cachedWritePer1MTokens: cachedWriteCost * 1_000_000 }
        : {}),
    };

    // 如果所有价格都为 0 且无缓存价格，视为无定价信息
    const hasPricing =
      inputCost > 0 ||
      outputCost > 0 ||
      cachedReadCost !== null ||
      cachedWriteCost !== null;

    const contextWindow =
      typeof entry.max_input_tokens === 'number'
        ? entry.max_input_tokens
        : typeof entry.max_tokens === 'number'
          ? entry.max_tokens
          : null;

    const maxOutputTokens =
      typeof entry.max_output_tokens === 'number'
        ? entry.max_output_tokens
        : null;

    return {
      modelId: key,
      contextWindow,
      maxOutputTokens,
      pricing: hasPricing ? pricing : null,
      capabilities: {
        vision: !!entry.supports_vision,
        functionCalling: !!entry.supports_function_calling,
        reasoning: false, // LiteLLM 不直接追踪 reasoning 能力
        structuredOutput: !!entry.supports_response_schema,
      },
    };
  }
}
