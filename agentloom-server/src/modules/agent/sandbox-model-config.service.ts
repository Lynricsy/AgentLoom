/**
 * Sandbox 模型配置边界：从租户模型记录生成容器级模型配置、解析运行时密钥，
 * 组装 harness（dsh）载荷与 runtime 插件文件，并负责 guest session 初始化；
 * 不管理 Agent 会话和工具生命周期。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import JSZip from 'jszip';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  AgentRuntimeConfig,
  HarnessConfig,
} from '../agent-definition/agent-runtime-config.interface';
import {
  ApiKeyNotFoundException,
  DefaultApiKeyNotConfiguredException,
} from '../api-key/api-key.exceptions';
import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import {
  PiConfigGeneratorService,
  resolvePiProviderApiKeyEnv,
  type PiModelConfig,
  type SkillInput,
} from '../sandbox/pi-config-generator.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import {
  SANDBOX_SESSION_FILE_MAX_BYTES,
  SANDBOX_SESSION_TOTAL_MAX_BYTES,
  SandboxRuntimePluginUnsupportedFileException,
  SandboxSessionPayloadTooLargeException,
} from '../sandbox/sandbox.exceptions';
import { RuntimePluginService } from '../runtime-plugin/runtime-plugin.service';
import type { AgentSession, McpServerConfig } from './types';

/**
 * 每个会话都会在 guest 内拉起 dsh 子进程并等待 bridge socket（guest 上限 30 s），
 * 单次 /v1/session 请求必须覆盖该启动窗口，否则超时重试会撞上进行中的会话创建。
 */
const SESSION_INIT_REQUEST_TIMEOUT_MS = 45_000;
const SESSION_INIT_REQUEST_TIMEOUT_WITH_MCP_MS = 90_000;
const SANDBOX_READY_TIMEOUT_MS = 60_000;
const SANDBOX_READY_TIMEOUT_WITH_MCP_MS = 120_000;
/** guest 对每个 npm 来源的 runtime 插件执行一次在线安装，单次上限 180 s */
const SESSION_INIT_NPM_PLUGIN_INSTALL_MS = 180_000;
/** 单次请求超时之外留给就绪重试的余量 */
const SESSION_INIT_RETRY_HEADROOM_MS = 30_000;
const SANDBOX_READY_POLL_INTERVAL_MS = 1_000;
/** 会话初始化失败时附带的 guest 错误原文上限 */
const GUEST_ERROR_DETAIL_MAX_CHARS = 4096;
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
    @Optional() private readonly runtimePluginService?: RuntimePluginService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }
  async buildContainerSessionPayload(params: {
    session: AgentSession;
    runtimeConfig?: AgentRuntimeConfig;
    mcpServers?: Readonly<Record<string, McpServerConfig>>;
    skills?: readonly SkillInput[];
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

    const files: Record<string, string> = {};

    // guest 把 files 写进 session agentDir；dsh 的 skill-filesystem 从
    // `<agentDir>/skills/<name>/SKILL.md` 发现技能
    if (params.skills?.length) {
      if (!this.piConfigGenerator) {
        throw new Error(
          'PiConfigGeneratorService 未注入，无法把技能写入沙箱会话',
        );
      }
      const skillDirs = this.piConfigGenerator.generateSkillFiles({
        skills: [...params.skills],
      });
      for (const [dirName, skillFiles] of Object.entries(skillDirs)) {
        for (const [fileName, content] of Object.entries(skillFiles)) {
          files[`skills/${dirName}/${fileName}`] = content;
        }
      }
    }

    const harness = params.runtimeConfig?.harness;
    if (harness) {
      payload['harness'] = await this.buildHarnessPayload(
        harness,
        params.session,
        files,
      );
    }

    if (Object.keys(files).length > 0) {
      // guest 写文件前按同样上限校验，超限会让会话创建失败；在 server 端提前拒绝并给出原因
      let totalBytes = 0;
      for (const [path, content] of Object.entries(files)) {
        const bytes = Buffer.byteLength(content);
        if (bytes > SANDBOX_SESSION_FILE_MAX_BYTES) {
          throw new SandboxSessionPayloadTooLargeException(
            `会话文件 ${path} 为 ${bytes} 字节，超过沙箱单文件上限 ${SANDBOX_SESSION_FILE_MAX_BYTES} 字节`,
          );
        }
        totalBytes += bytes;
      }
      if (totalBytes > SANDBOX_SESSION_TOTAL_MAX_BYTES) {
        throw new SandboxSessionPayloadTooLargeException(
          `会话文件（技能与 runtime 插件）合计 ${totalBytes} 字节，超过沙箱会话上限 ${SANDBOX_SESSION_TOTAL_MAX_BYTES} 字节`,
        );
      }
      payload['files'] = files;
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

  /**
   * 生成 guest 的 harness 载荷：package 插件补上 manifest.id（pluginId），
   * 并把已签名包内全部文件解包为 `plugins/<pluginId>/<path>` 写入 files。
   */
  private async buildHarnessPayload(
    harness: HarnessConfig,
    session: AgentSession,
    files: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const plugins: Array<Record<string, unknown>> = [];

    for (const plugin of harness.plugins) {
      // 停用节点与 npm 插件原样下发：前者由 guest 跳过，后者由 guest 在线安装
      if (plugin.source !== 'package' || !plugin.enabled) {
        plugins.push({ ...plugin });
        continue;
      }
      if (!this.runtimePluginService) {
        throw new Error(
          'RuntimePluginService 未注入，无法下发 runtime 插件包到沙箱会话',
        );
      }
      const tenantId = session.tenantId;
      if (!tenantId) {
        throw new Error(
          `Session ${session.id} 缺少 tenantId，无法解析 runtime 插件 ${plugin.ref}`,
        );
      }
      const runtimePluginService = this.runtimePluginService;
      const record = await runInTenantTransaction(this.db, tenantId, () =>
        runtimePluginService.findActiveById(plugin.ref, tenantId),
      );
      plugins.push({ ...plugin, pluginId: record.pluginId });

      // 对象存储读取不占用数据库事务
      const archive = await runtimePluginService.downloadArchive(record);
      const zip = await JSZip.loadAsync(archive);
      const decoder = new TextDecoder('utf-8', { fatal: true });
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        let content: string;
        try {
          content = decoder.decode(await entry.async('uint8array'));
        } catch {
          throw new SandboxRuntimePluginUnsupportedFileException(
            record.pluginId,
            entry.name,
          );
        }
        files[`plugins/${record.pluginId}/${entry.name}`] = content;
      }
    }

    return {
      engine: harness.engine,
      ...(harness.profilePatch !== undefined
        ? { profilePatch: harness.profilePatch }
        : {}),
      plugins,
    };
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

        // guest 对插件加载、profile 生成等确定性失败返回 422，message 是给用户看的原因。
        const detail = await this.readGuestErrorMessage(response);
        const responseError = new Error(
          `Container session init failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
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

  private async readGuestErrorMessage(response: Response): Promise<string> {
    const text = (await response.text().catch(() => '')).trim();
    let message = text;
    try {
      const body = this.asRecord(JSON.parse(text));
      const field = body?.['message'] ?? body?.['error'];
      if (typeof field === 'string') message = field;
    } catch {
      // 非 JSON 响应体按原文展示。
    }
    return message.slice(0, GUEST_ERROR_DETAIL_MAX_CHARS);
  }

  private resolveSessionInitTimeouts(payload: Record<string, unknown>): {
    requestTimeoutMs: number;
    totalTimeoutMs: number;
  } {
    const hasMcpServers = this.hasConfiguredMcpServers(payload);
    const baseRequestTimeoutMs = hasMcpServers
      ? SESSION_INIT_REQUEST_TIMEOUT_WITH_MCP_MS
      : SESSION_INIT_REQUEST_TIMEOUT_MS;
    const baseTotalTimeoutMs = hasMcpServers
      ? SANDBOX_READY_TIMEOUT_WITH_MCP_MS
      : SANDBOX_READY_TIMEOUT_MS;
    const npmPluginCount = this.countEnabledNpmPlugins(payload);

    if (npmPluginCount === 0) {
      return {
        requestTimeoutMs: baseRequestTimeoutMs,
        totalTimeoutMs: baseTotalTimeoutMs,
      };
    }

    const requestTimeoutMs =
      baseRequestTimeoutMs +
      npmPluginCount * SESSION_INIT_NPM_PLUGIN_INSTALL_MS;
    return {
      requestTimeoutMs,
      totalTimeoutMs: requestTimeoutMs + SESSION_INIT_RETRY_HEADROOM_MS,
    };
  }

  private countEnabledNpmPlugins(payload: Record<string, unknown>): number {
    const harness = this.asRecord(payload['harness']);
    const plugins = harness?.['plugins'];
    if (!Array.isArray(plugins)) return 0;
    return plugins.filter((plugin: unknown) => {
      const record = this.asRecord(plugin);
      return record?.['source'] === 'npm' && record['enabled'] !== false;
    }).length;
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
