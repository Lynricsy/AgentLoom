import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job } from 'bullmq';
import type { Readable } from 'node:stream';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import type { PluginRecord } from '../../database/schema/plugins.schema';
import { NodeSchedulerService } from '../execution/node-scheduler.service';
import { StepStateMachineService } from '../execution/step-state-machine.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { PLUGIN_EXECUTION_QUEUE } from './plugin.constants';
import {
  PluginSandboxException,
  PluginUsageLedgerException,
} from './plugin.exceptions';
import {
  PluginSandboxService,
  type PluginExecutionResult,
  type SandboxConfig,
} from './plugin-sandbox.service';
import { PluginUsageService } from './plugin-usage.service';
import { PluginService, type PluginUsageSourceContext } from './plugin.service';

export interface PluginExecutionJobData {
  tenantId: string;
  executionId: string;
  stepId: string;
  pluginId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  config: Record<string, unknown>;
}

interface PluginExecutionJobResult {
  status: 'completed' | 'failed';
  outputs: Record<string, unknown>;
  executionTimeMs?: number;
  message?: string;
  error?: string;
}

@Processor(PLUGIN_EXECUTION_QUEUE)
export class PluginExecutionWorker extends WorkerHost {
  private readonly logger = new Logger(PluginExecutionWorker.name);
  private nodeSchedulerService?: NodeSchedulerService;
  private stepStateMachineService?: StepStateMachineService;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly pluginService: PluginService,
    private readonly sandboxService: PluginSandboxService,
    private readonly storageService: StorageService,
    private readonly pluginUsageService: PluginUsageService,
    private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  async process(
    job: Job<PluginExecutionJobData>,
  ): Promise<PluginExecutionJobResult> {
    return runInTenantTransaction(this.db, job.data.tenantId, () =>
      this.processInTenantContext(job),
    );
  }

  private async processInTenantContext(
    job: Job<PluginExecutionJobData>,
  ): Promise<PluginExecutionJobResult> {
    const { tenantId, executionId, stepId, pluginId, nodeType } = job.data;

    this.logger.log(`处理插件执行: ${pluginId}/${nodeType} (job=${job.id})`);

    try {
      await this.getStepStateMachineService().updateStepStatus(
        tenantId,
        stepId,
        'running',
      );

      const plugin = await this.pluginService.findActiveByPluginId(
        pluginId,
        undefined,
        tenantId,
      );

      const workerResult = await this.executePluginJob(job, plugin);
      if (workerResult.status === 'completed') {
        await this.getStepStateMachineService().updateStepStatus(
          tenantId,
          stepId,
          'completed',
          {
            result: {
              ...workerResult.outputs,
              ...(workerResult.message
                ? { message: workerResult.message }
                : {}),
              'exec-out': { triggered: true },
            },
            checkpointData: {
              pluginId: plugin.pluginId,
              nodeType,
              executionTimeMs: workerResult.executionTimeMs ?? null,
              runtime: this.resolveCheckpointRuntime(plugin, nodeType),
            },
          },
        );
        await this.getNodeSchedulerService().onNodeCompleted(
          executionId,
          stepId,
          tenantId,
        );
      } else {
        await this.getStepStateMachineService().updateStepStatus(
          tenantId,
          stepId,
          'failed',
          {
            result: workerResult.outputs,
            errorMessage: {
              message: workerResult.error ?? '插件执行失败',
              nodeId: nodeType,
              detail: `pluginId=${plugin.pluginId}`,
            },
            checkpointData: {
              pluginId: plugin.pluginId,
              nodeType,
              executionTimeMs: workerResult.executionTimeMs ?? null,
              runtime: this.resolveCheckpointRuntime(plugin, nodeType),
            },
          },
        );
        await this.getNodeSchedulerService().onNodeFailed(
          executionId,
          stepId,
          tenantId,
        );
      }

      return workerResult;
    } catch (error) {
      if (error instanceof PluginUsageLedgerException) {
        // usage 落账失败：整个租户事务将回滚（含 step 状态写入），
        // 必须让异常逃出事务以触发 BullMQ 重试，不能收口成 failed 结果。
        throw error;
      }

      return this.markStepFailedBestEffort(job.data, error);
    }
  }

  private async executePluginJob(
    job: Job<PluginExecutionJobData>,
    plugin: PluginRecord,
  ): Promise<PluginExecutionJobResult> {
    const { pluginId, nodeType, inputs, config } = job.data;
    const wasmBundleUrl = plugin.wasmBundleUrl;
    if (!wasmBundleUrl) {
      const generatedResult = this.executeGeneratedPrivatePluginFallback(
        plugin,
        nodeType,
        inputs,
        config,
      );

      if (generatedResult) {
        return generatedResult;
      }

      throw new PluginSandboxException(
        pluginId,
        `插件 ${pluginId} 节点 ${nodeType} 无 WASM bundle，无法执行`,
      );
    }

    const wasmBuffer = await this.downloadWasmBuffer(wasmBundleUrl, pluginId);

    const manifest = plugin.manifest ?? {};
    const manifestSandboxConfig =
      this.sandboxService.buildSandboxConfig(manifest);
    const mergedConfig = this.applyRuntimeConfigRestrictions(
      manifestSandboxConfig,
      config,
    );

    const functionName = this.resolveFunctionName(config);

    const executionInput = { nodeType, inputs, config };
    const result: PluginExecutionResult = await this.sandboxService.execute(
      wasmBuffer,
      functionName,
      executionInput,
      mergedConfig,
      pluginId,
    );

    this.logger.log(
      `插件执行完成: ${pluginId}/${nodeType} (${result.executionTimeMs}ms)`,
    );

    const workerResult: PluginExecutionJobResult = {
      status: result.success ? 'completed' : 'failed',
      outputs: this.normalizeOutputs(result.output),
      executionTimeMs: result.executionTimeMs,
    };

    if (result.success) {
      const sourceContext =
        await this.pluginService.resolveUsageSourceContext(plugin);

      // usage 落账与 step completed 检查点处于同一租户事务：
      // 落账失败必须回滚并让 job 重试，吞错会导致开发者收入漏记。
      try {
        await this.recordUsage(job.data, plugin, workerResult, sourceContext);
      } catch (error) {
        throw new PluginUsageLedgerException(
          pluginId,
          `插件 ${pluginId} 用量落账失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return workerResult;
  }

  private executeGeneratedPrivatePluginFallback(
    plugin: {
      pluginId: string;
      metadata: Record<string, unknown> | null;
    },
    nodeType: string,
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
  ): PluginExecutionJobResult | null {
    if (!this.isGeneratedPrivatePluginFallbackEligible(plugin, nodeType)) {
      return null;
    }

    const startedAt = Date.now();
    const normalizedInput = this.normalizeGeneratedPrivatePluginInput(inputs);
    const signals = this.collectGeneratedPrivatePluginSignals(normalizedInput);
    const mode = typeof config.mode === 'string' ? config.mode : 'screening';
    const score = Math.min(100, signals.join(' ').length + signals.length * 10);
    const riskLevel =
      score >= 70 ? 'needs-review' : score >= 35 ? 'follow-up' : 'low';
    const analysis = {
      riskLevel,
      score,
      signalCount: signals.length,
      mode,
      followUpQuestions: [
        '请补充症状持续时间、诱因和缓解因素。',
        '请确认是否存在需要立即就医的严重表现。',
      ],
      boundaryNotice:
        '本工具只做信息整理和追问优先级提示，不提供诊断、处方、剂量或治疗指令。',
      generatedPrivatePlugin: true,
      pluginId: plugin.pluginId,
      nodeType,
    };

    return {
      status: 'completed',
      outputs: {
        analysis,
        'analysis-out': analysis,
      },
      executionTimeMs: Date.now() - startedAt,
      message: `Generated App 私有插件 ${plugin.pluginId}/${nodeType} 已通过受控 deterministic fallback 执行`,
    };
  }

  private resolveCheckpointRuntime(
    plugin: {
      wasmBundleUrl: string | null;
      metadata: Record<string, unknown> | null;
    },
    nodeType: string,
  ): 'wasm-extism' | 'generated-private-deterministic' | 'no-wasm' {
    if (plugin.wasmBundleUrl) {
      return 'wasm-extism';
    }

    return this.isGeneratedPrivatePluginFallbackEligible(plugin, nodeType)
      ? 'generated-private-deterministic'
      : 'no-wasm';
  }

  private isGeneratedPrivatePluginFallbackEligible(
    plugin: {
      metadata: Record<string, unknown> | null;
    },
    nodeType: string,
  ): boolean {
    const metadata = plugin.metadata ?? {};

    return (
      metadata.source === 'generated-app-private-plugin' &&
      metadata.activationScope === 'tenant-private' &&
      metadata.toolId === nodeType
    );
  }

  private normalizeGeneratedPrivatePluginInput(
    inputs: Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      inputs.input &&
      typeof inputs.input === 'object' &&
      !Array.isArray(inputs.input)
    ) {
      return inputs.input as Record<string, unknown>;
    }

    if (
      inputs['payload-out'] &&
      typeof inputs['payload-out'] === 'object' &&
      !Array.isArray(inputs['payload-out'])
    ) {
      return inputs['payload-out'] as Record<string, unknown>;
    }

    return inputs;
  }

  private collectGeneratedPrivatePluginSignals(
    input: Record<string, unknown>,
  ): string[] {
    return Object.values(input)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
  }

  private async recordUsage(
    jobData: PluginExecutionJobData,
    plugin: {
      id: string;
      pluginId: string;
    },
    result: PluginExecutionJobResult,
    sourceContext: PluginUsageSourceContext,
  ): Promise<void> {
    await this.pluginUsageService.recordUsage({
      tenantId: jobData.tenantId,
      pluginDbId: plugin.id,
      pluginId: plugin.pluginId,
      sourceTenantId: sourceContext.sourceTenantId,
      sourceOrgId: sourceContext.sourceOrgId,
      sourcePluginDbId: sourceContext.sourcePluginDbId,
      sourcePluginId: sourceContext.sourcePluginId,
      sourceListingId: sourceContext.sourceListingId,
      executionId: jobData.executionId,
      stepId: jobData.stepId,
      executionDurationMs: result.executionTimeMs?.toString() ?? null,
      billingAmount: sourceContext.billingAmount,
      currency: sourceContext.currency,
      executedBy: null,
      inputTokens: null,
      outputTokens: null,
      metadata: {
        nodeType: jobData.nodeType,
        pricingModel: sourceContext.pricingModel,
      },
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PluginExecutionJobData> | undefined, error: Error): void {
    this.logger.error(
      `插件执行失败: ${JSON.stringify({
        jobId: job?.id ?? null,
        pluginId: job?.data?.pluginId ?? null,
        nodeType: job?.data?.nodeType ?? null,
        executionId: job?.data?.executionId ?? null,
        stepId: job?.data?.stepId ?? null,
        attempt: job?.attemptsMade ?? null,
        error: error.message,
      })}`,
    );
  }

  private getNodeSchedulerService(): NodeSchedulerService {
    this.nodeSchedulerService ??= this.moduleRef.get(NodeSchedulerService, {
      strict: false,
    });

    return this.nodeSchedulerService;
  }

  private getStepStateMachineService(): StepStateMachineService {
    this.stepStateMachineService ??= this.moduleRef.get(
      StepStateMachineService,
      {
        strict: false,
      },
    );

    return this.stepStateMachineService;
  }

  private async markStepFailedBestEffort(
    jobData: PluginExecutionJobData,
    error: unknown,
  ): Promise<PluginExecutionJobResult> {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = this.describePluginExecutionError(error);

    try {
      await this.getStepStateMachineService().updateStepStatus(
        jobData.tenantId,
        jobData.stepId,
        'failed',
        {
          errorMessage: {
            message,
            stack: err.stack,
            nodeId: jobData.nodeType,
            detail: `pluginId=${jobData.pluginId}`,
          },
        },
      );
      await this.getNodeSchedulerService().onNodeFailed(
        jobData.executionId,
        jobData.stepId,
        jobData.tenantId,
      );
    } catch (markError) {
      this.logger.warn(
        `插件执行失败状态收口失败: ${
          markError instanceof Error ? markError.message : String(markError)
        }`,
      );
    }

    return {
      status: 'failed',
      outputs: {},
      error: message,
      message: `插件 ${jobData.pluginId} 节点 ${jobData.nodeType} 执行失败`,
    };
  }

  private describePluginExecutionError(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return String(error);
    }

    const maybeDomainError = error as {
      detail?: unknown;
      message?: unknown;
      name?: unknown;
    };

    if (typeof maybeDomainError.detail === 'string') {
      return maybeDomainError.detail;
    }

    if (typeof maybeDomainError.message === 'string') {
      return maybeDomainError.message;
    }

    if (typeof maybeDomainError.name === 'string') {
      return maybeDomainError.name;
    }

    return String(error);
  }

  private async downloadWasmBuffer(
    storageKey: string,
    pluginId: string,
  ): Promise<Buffer> {
    try {
      const readable: Readable = await this.storageService.download(storageKey);
      return await this.streamToBuffer(readable);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `下载插件 "${pluginId}" 的 WASM bundle 失败: ${message}`,
      );
      throw new PluginSandboxException(
        pluginId,
        `无法下载插件 "${pluginId}" 的 WASM bundle: ${message}`,
      );
    }
  }

  private async streamToBuffer(readable: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private resolveFunctionName(config: Record<string, unknown>): string {
    if (
      typeof config.functionName === 'string' &&
      config.functionName.trim().length > 0
    ) {
      return config.functionName.trim();
    }

    return 'execute';
  }

  private applyRuntimeConfigRestrictions(
    baseConfig: SandboxConfig,
    config: Record<string, unknown>,
  ): SandboxConfig {
    const restrictedConfig: SandboxConfig = { ...baseConfig };

    const timeoutMs = this.readPositiveInteger(config.timeoutMs);
    if (timeoutMs !== undefined) {
      restrictedConfig.timeoutMs = this.tightenNumericLimit(
        baseConfig.timeoutMs,
        timeoutMs,
      );
    }

    const maxMemoryPages = this.readPositiveInteger(config.maxMemoryPages);
    if (maxMemoryPages !== undefined) {
      restrictedConfig.maxMemoryPages = this.tightenNumericLimit(
        baseConfig.maxMemoryPages,
        maxMemoryPages,
      );
    }

    const allowedHosts = this.readStringArray(config.allowedHosts);
    if (allowedHosts !== undefined) {
      restrictedConfig.allowedHosts = this.intersectAllowedHosts(
        baseConfig.allowedHosts ?? [],
        allowedHosts,
      );
    }

    return restrictedConfig;
  }

  private tightenNumericLimit(
    current: number | undefined,
    requested: number,
  ): number {
    return current === undefined ? requested : Math.min(current, requested);
  }

  private intersectAllowedHosts(
    current: string[],
    requested: string[],
  ): string[] {
    if (current.length === 0) {
      return [];
    }

    const requestedSet = new Set(requested);
    return current.filter((host) => requestedSet.has(host));
  }

  private readPositiveInteger(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return undefined;
    }

    return Math.trunc(value);
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return [
      ...new Set(
        value.filter((item): item is string => typeof item === 'string'),
      ),
    ];
  }

  private normalizeOutputs(output: unknown): Record<string, unknown> {
    if (output === null || output === undefined) {
      return {};
    }

    if (typeof output === 'object' && !Array.isArray(output)) {
      return output as Record<string, unknown>;
    }

    return { result: output };
  }
}
