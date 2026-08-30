/**
 * Sandbox 模型配置边界：从租户模型记录生成容器级 pi 配置、解析运行时密钥，
 * 并负责 guest session 初始化；不管理 Agent 会话和工具生命周期。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import {
  ApiKeyNotFoundException,
  DefaultApiKeyNotConfiguredException,
} from '../api-key/api-key.exceptions';
import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import {
  PiConfigGeneratorService,
  resolvePiProviderApiKeyEnv,
  type PiModelConfig,
} from '../sandbox/pi-config-generator.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import type { AgentSession, McpServerConfig } from './types';

const SESSION_INIT_REQUEST_TIMEOUT_MS = 5_000;
const SESSION_INIT_REQUEST_TIMEOUT_WITH_MCP_MS = 90_000;
const SANDBOX_READY_TIMEOUT_MS = 30_000;
const SANDBOX_READY_TIMEOUT_WITH_MCP_MS = 120_000;
const SANDBOX_READY_POLL_INTERVAL_MS = 1_000;
const RETRYABLE_SESSION_INIT_STATUSES = new Set([
  404, 408, 425, 429, 500, 502, 503, 504,
]);
const RETRYABLE_SESSION_INIT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

type ResolvedPiModelConfig = {
  modelConfig: PiModelConfig;
  sourceModelConfig?: schema.LlmModelConfig;
  sourceProvider?: schema.LlmProvider;
};

@Injectable()
export class SandboxModelConfigService {
  private readonly logger = new Logger(SandboxModelConfigService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly runtimeDriver: SandboxRuntimeDriver,
    @Optional()
    private readonly decryptionBoundaryService?: DecryptionBoundaryService,
    @Optional() private readonly piConfigGenerator?: PiConfigGeneratorService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }
  async buildContainerSessionPayload(params: {
    session: AgentSession;
    runtimeConfig?: AgentRuntimeConfig;
    mcpServers?: Readonly<Record<string, McpServerConfig>>;
  }): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};
    const systemPrompt = this.normalizeOptionalString(
      params.session.systemPrompt,
    );

    if (systemPrompt) {
      payload['systemPrompt'] = systemPrompt;
    }

    if (params.mcpServers && Object.keys(params.mcpServers).length > 0) {
      payload['mcpServers'] = params.mcpServers;
    }

    if (params.runtimeConfig?.nativeToolPolicy) {
      payload['nativeToolPolicy'] = params.runtimeConfig.nativeToolPolicy;
    }

    const piConfig = await this.resolveSessionPiConfig(
      params.session,
      params.runtimeConfig,
    );
    if (piConfig) {
      Object.assign(payload, piConfig);
    }

    return payload;
  }

  private async resolveSessionPiConfig(
    session: AgentSession,
    runtimeConfig?: AgentRuntimeConfig,
  ): Promise<Record<string, unknown> | null> {
    if (!this.piConfigGenerator) {
      return null;
    }

    const resolvedModelConfig = await this.resolvePiModelConfig(
      session,
      runtimeConfig,
    );

    if (!resolvedModelConfig) {
      return null;
    }

    const settings = this.parseJsonObject(
      this.piConfigGenerator.generateSettings({
        modelConfig: resolvedModelConfig.modelConfig,
      }),
      'pi settings',
    );
    const models = this.parseJsonObject(
      this.piConfigGenerator.generateModelsJson({
        modelConfig: resolvedModelConfig.modelConfig,
      }),
      'pi models',
    );
    const runtimeApiKeys =
      await this.resolveRuntimeApiKeys(resolvedModelConfig);

    this.ensureDynamicProviderApiKey(
      models,
      resolvedModelConfig.modelConfig,
      runtimeApiKeys,
    );

    this.logger.log(
      `Sandbox session pi config ${JSON.stringify({
        sessionId: session.id,
        tenantId: session.tenantId ?? null,
        llmModelConfigId: session.llmModelConfigId ?? null,
        provider: resolvedModelConfig.modelConfig.provider,
        model: resolvedModelConfig.modelConfig.model,
        usedStoredConfig: Boolean(resolvedModelConfig.sourceModelConfig),
        defaultProvider:
          this.normalizeOptionalString(settings['defaultProvider']) ?? null,
        defaultModel:
          this.normalizeOptionalString(settings['defaultModel']) ?? null,
        modelProviders: Object.keys(this.asRecord(models['providers']) ?? {}),
        runtimeApiKeyProviders: Object.keys(runtimeApiKeys ?? {}),
        providerApiKeyField: this.readProviderApiKeyField(
          models,
          resolvedModelConfig.modelConfig.provider,
        ),
      })}`,
    );

    return {
      settings,
      models,
      ...(runtimeApiKeys ? { runtimeApiKeys } : {}),
    };
  }

  private async resolvePiModelConfig(
    session: AgentSession,
    runtimeConfig?: AgentRuntimeConfig,
  ): Promise<ResolvedPiModelConfig | null> {
    const fallbackModelConfig = this.toPiModelConfigFromRuntimeModelConfig(
      runtimeConfig?.modelConfig,
    );

    if (!session.tenantId) {
      return fallbackModelConfig ? { modelConfig: fallbackModelConfig } : null;
    }

    try {
      return await this.resolveStoredPiModelConfig(session);
    } catch (error) {
      if (!fallbackModelConfig) {
        throw error;
      }

      this.logger.warn(
        `无法读取会话 ${session.id} 的租户模型配置，回退到 runtimeConfig 模型快照: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { modelConfig: fallbackModelConfig };
    }
  }

  private async resolveStoredPiModelConfig(
    session: AgentSession,
  ): Promise<ResolvedPiModelConfig> {
    if (!session.tenantId) {
      throw new Error(`Session ${session.id} 缺少 tenantId`);
    }

    const tenantId = session.tenantId;
    const llmModelConfigId = session.llmModelConfigId;

    return runInTenantTransaction(this.db, tenantId, async () => {
      if (llmModelConfigId) {
        const [row] = await this.tenantDb
          .select({
            config: schema.llmModelConfigs,
            provider: schema.llmProviders,
          })
          .from(schema.llmModelConfigs)
          .innerJoin(
            schema.llmProviders,
            eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
          )
          .where(
            and(
              eq(schema.llmModelConfigs.id, llmModelConfigId),
              eq(schema.llmModelConfigs.tenantId, tenantId),
            ),
          );

        if (!row) {
          throw new Error(`LLM 模型配置不存在: ${llmModelConfigId}`);
        }

        return {
          modelConfig: this.toPiModelConfig(row.config, row.provider),
          sourceModelConfig: row.config,
          sourceProvider: row.provider,
        };
      }

      const [defaultRow] = await this.tenantDb
        .select({
          config: schema.llmModelConfigs,
          provider: schema.llmProviders,
        })
        .from(schema.llmModelConfigs)
        .innerJoin(
          schema.llmProviders,
          eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
        )
        .where(
          and(
            eq(schema.llmModelConfigs.tenantId, tenantId),
            eq(schema.llmModelConfigs.isDefault, true),
          ),
        );

      if (!defaultRow) {
        throw new Error(`租户 ${tenantId} 未配置默认 LLM 模型`);
      }

      session.llmModelConfigId = defaultRow.config.id;

      return {
        modelConfig: this.toPiModelConfig(
          defaultRow.config,
          defaultRow.provider,
        ),
        sourceModelConfig: defaultRow.config,
        sourceProvider: defaultRow.provider,
      };
    });
  }

  private async resolveRuntimeApiKeys(
    resolvedModelConfig: ResolvedPiModelConfig,
  ): Promise<Record<string, string> | undefined> {
    if (!this.decryptionBoundaryService) {
      return undefined;
    }

    const apiKey = await this.resolveRuntimeApiKey(resolvedModelConfig);
    if (!apiKey) {
      return undefined;
    }

    return {
      [resolvedModelConfig.modelConfig.provider]: apiKey,
    };
  }

  private async resolveRuntimeApiKey(
    resolvedModelConfig: ResolvedPiModelConfig,
  ): Promise<string | undefined> {
    if (!this.decryptionBoundaryService) {
      return undefined;
    }

    const { modelConfig, sourceModelConfig, sourceProvider } =
      resolvedModelConfig;
    const providerApiKeyEnv = resolvePiProviderApiKeyEnv(modelConfig);

    if (!providerApiKeyEnv) {
      return undefined;
    }

    const tenantId = this.normalizeOptionalString(
      sourceModelConfig?.tenantId ?? modelConfig.tenantId,
    );
    const organizationId = this.normalizeOptionalString(
      sourceModelConfig?.orgId ?? modelConfig.organizationId,
    );
    const apiKeyId = this.normalizeOptionalString(
      sourceProvider?.apiKeyId ?? modelConfig.apiKeyId,
    );

    if (!tenantId) {
      return undefined;
    }

    try {
      if (apiKeyId) {
        return await this.decryptionBoundaryService.decryptApiKey(
          apiKeyId,
          tenantId,
          'SandboxAgentAdapter',
        );
      }

      if (!organizationId) {
        return undefined;
      }

      return await this.decryptionBoundaryService.decryptConfiguredApiKey(
        {
          apiKeyId: null,
          organizationId,
          tenantId,
          provider: modelConfig.provider,
        },
        'SandboxAgentAdapter',
      );
    } catch (error) {
      if (
        (error instanceof DefaultApiKeyNotConfiguredException ||
          error instanceof ApiKeyNotFoundException) &&
        process.env[providerApiKeyEnv]
      ) {
        this.logger.warn(
          `共享 sandbox 会话 ${modelConfig.provider}/${modelConfig.model} 未找到受管 API Key，回退到容器继承环境变量 ${providerApiKeyEnv}`,
        );
        return undefined;
      }

      throw error;
    }
  }

  private readProviderApiKeyField(
    models: Record<string, unknown>,
    provider: string,
  ): string | null {
    const providers = this.asRecord(models['providers']);
    if (!providers) {
      return null;
    }

    const providerConfig = this.asRecord(providers[provider]);
    if (!providerConfig) {
      return null;
    }

    return this.normalizeOptionalString(providerConfig['apiKey']) ?? null;
  }

  private ensureDynamicProviderApiKey(
    models: Record<string, unknown>,
    modelConfig: PiModelConfig,
    runtimeApiKeys?: Record<string, string>,
  ): void {
    const runtimeApiKey = this.normalizeOptionalString(
      runtimeApiKeys?.[modelConfig.provider],
    );
    if (!runtimeApiKey) {
      return;
    }

    const providers = this.asRecord(models['providers']);
    if (!providers) {
      return;
    }

    const providerConfig = this.asRecord(providers[modelConfig.provider]);
    if (!providerConfig) {
      return;
    }

    const configuredModels = providerConfig['models'];
    if (!Array.isArray(configuredModels) || configuredModels.length === 0) {
      return;
    }

    // 共享 sandbox 的 session 级 runtimeApiKey 必须优先于静态 env 占位值，
    // 否则 pi runtime 会继续尝试把 `ANTHROPIC_API_KEY` 之类的字面量当作真实密钥使用。
    providerConfig['apiKey'] = '__runtime__';
  }

  private toPiModelConfig(
    modelConfig: schema.LlmModelConfig,
    provider: schema.LlmProvider,
  ): PiModelConfig {
    const baseUrl = this.resolvePiModelBaseUrl(modelConfig, provider);

    return {
      provider: provider.slug,
      model: modelConfig.modelId,
      apiProtocol: provider.apiProtocol,
      ...(baseUrl ? { apiBaseUrl: baseUrl } : {}),
      apiKeyId: provider.apiKeyId ?? null,
      organizationId: modelConfig.orgId,
      tenantId: modelConfig.tenantId,
    };
  }

  private resolvePiModelBaseUrl(
    modelConfig: schema.LlmModelConfig,
    provider: schema.LlmProvider,
  ): string | undefined {
    const providerBaseUrl = this.normalizeOptionalString(
      provider.baseUrl ?? provider.defaultBaseUrl,
    );
    if (providerBaseUrl) {
      return providerBaseUrl;
    }

    const parameters =
      modelConfig.parameters &&
      typeof modelConfig.parameters === 'object' &&
      !Array.isArray(modelConfig.parameters)
        ? (modelConfig.parameters as Record<string, unknown>)
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

  private toPiModelConfigFromRuntimeModelConfig(
    modelConfig?: AgentRuntimeConfig['modelConfig'],
  ): PiModelConfig | undefined {
    const provider = this.normalizeOptionalString(modelConfig?.provider);
    const model =
      this.normalizeOptionalString(modelConfig?.modelName) ??
      this.normalizeOptionalString(modelConfig?.modelId);

    if (!provider || !model) {
      return undefined;
    }

    const apiBaseUrl = this.resolvePiRuntimeModelBaseUrl(modelConfig);
    const apiProtocol = this.normalizeOptionalString(modelConfig?.apiProtocol);
    const authMethod = this.normalizeOptionalString(modelConfig?.authMethod);

    return {
      provider,
      model,
      ...(apiProtocol ? { apiProtocol } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(typeof modelConfig?.apiKeyId === 'string' ||
      modelConfig?.apiKeyId === null
        ? { apiKeyId: modelConfig.apiKeyId }
        : {}),
      ...(authMethod ? { authMethod } : {}),
    };
  }

  private resolvePiRuntimeModelBaseUrl(
    modelConfig?: AgentRuntimeConfig['modelConfig'],
  ): string | undefined {
    const endpointUrl = this.normalizeOptionalString(modelConfig?.endpointUrl);
    if (endpointUrl) {
      return endpointUrl;
    }

    const parameters =
      modelConfig?.customParameters &&
      typeof modelConfig.customParameters === 'object' &&
      !Array.isArray(modelConfig.customParameters)
        ? (modelConfig.customParameters as Record<string, unknown>)
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

  private parseJsonObject(
    rawJson: string,
    label: string,
  ): Record<string, unknown> {
    const parsed = JSON.parse(rawJson) as unknown;

    if (!this.isRecord(parsed)) {
      throw new Error(`${label} 必须是 JSON object`);
    }

    return parsed;
  }

  async initializeContainerSession(
    runtimeHandle: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { requestTimeoutMs, totalTimeoutMs } =
      this.resolveSessionInitTimeouts(payload);
    const startedAt = Date.now();
    let lastError: Error | null = null;
    let attempt = 0;

    while (Date.now() - startedAt < totalTimeoutMs) {
      attempt += 1;

      try {
        const response = await this.runtimeDriver.requestGuest(
          runtimeHandle,
          '/v1/session',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(requestTimeoutMs),
          },
        );

        if (response.ok) {
          return;
        }

        const responseError = new Error(
          `Container session init failed with status ${response.status}`,
        );
        if (!this.isRetryableSessionInitStatus(response.status)) {
          throw responseError;
        }

        lastError = responseError;
      } catch (error) {
        if (!this.isRetryableSessionInitError(error)) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
      }

      this.logger.warn(
        `Sandbox 容器会话初始化未就绪，${SANDBOX_READY_POLL_INTERVAL_MS}ms 后重试（第 ${attempt} 次，requestTimeout=${requestTimeoutMs}ms, totalTimeout=${totalTimeoutMs}ms）: ${lastError.message}`,
      );
      await this.delay(SANDBOX_READY_POLL_INTERVAL_MS);
    }

    throw (
      lastError ??
      new Error(
        `Container session init did not become ready within ${totalTimeoutMs}ms`,
      )
    );
  }

  private resolveSessionInitTimeouts(payload: Record<string, unknown>): {
    requestTimeoutMs: number;
    totalTimeoutMs: number;
  } {
    const hasMcpServers = this.hasConfiguredMcpServers(payload);

    if (!hasMcpServers) {
      return {
        requestTimeoutMs: SESSION_INIT_REQUEST_TIMEOUT_MS,
        totalTimeoutMs: SANDBOX_READY_TIMEOUT_MS,
      };
    }

    return {
      requestTimeoutMs: SESSION_INIT_REQUEST_TIMEOUT_WITH_MCP_MS,
      totalTimeoutMs: SANDBOX_READY_TIMEOUT_WITH_MCP_MS,
    };
  }

  private hasConfiguredMcpServers(payload: Record<string, unknown>): boolean {
    const mcpServers = payload['mcpServers'];
    return (
      typeof mcpServers === 'object' &&
      mcpServers !== null &&
      Object.keys(mcpServers).length > 0
    );
  }

  private isRetryableSessionInitStatus(status: number): boolean {
    return RETRYABLE_SESSION_INIT_STATUSES.has(status);
  }

  private isRetryableSessionInitError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return true;
    }

    if (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return true;
    }

    const { cause } = error;
    if (!cause || typeof cause !== 'object' || !('code' in cause)) {
      return false;
    }

    return (
      typeof cause.code === 'string' &&
      RETRYABLE_SESSION_INIT_ERROR_CODES.has(cause.code)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return this.isRecord(value) ? value : undefined;
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? this.normalizeString(value) : undefined;
  }

  private normalizeString(value?: string | null): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
