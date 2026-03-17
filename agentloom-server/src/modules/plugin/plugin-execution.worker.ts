import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Readable } from 'node:stream';

import { StorageService } from '../../infrastructure/storage/storage.service';
import { PLUGIN_EXECUTION_QUEUE } from './plugin.constants';
import {
  PluginSandboxException,
} from './plugin.exceptions';
import {
  PluginSandboxService,
  type PluginExecutionResult,
  type SandboxConfig,
} from './plugin-sandbox.service';
import { PluginUsageService } from './plugin-usage.service';
import {
  PluginService,
  type PluginUsageSourceContext,
} from './plugin.service';

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

  constructor(
    private readonly pluginService: PluginService,
    private readonly sandboxService: PluginSandboxService,
    private readonly storageService: StorageService,
    private readonly pluginUsageService: PluginUsageService,
  ) {
    super();
  }

  async process(job: Job<PluginExecutionJobData>): Promise<PluginExecutionJobResult> {
    const { tenantId, pluginId, nodeType, inputs, config } = job.data;

    this.logger.log(
      `处理插件执行: ${pluginId}/${nodeType} (job=${job.id})`,
    );

    const plugin = await this.pluginService.findActiveByPluginId(
      pluginId,
      undefined,
      tenantId,
    );

    const wasmBundleUrl = plugin.wasmBundleUrl;
    if (!wasmBundleUrl) {
      this.logger.warn(
        `插件 "${pluginId}" 未关联 WASM bundle，返回占位结果`,
      );
      return {
        status: 'completed',
        outputs: {},
        message: `插件 ${pluginId} 节点 ${nodeType} 无 WASM bundle，跳过执行`,
      };
    }

    const wasmBuffer = await this.downloadWasmBuffer(wasmBundleUrl, pluginId);

    const manifest = (plugin.manifest ?? {}) as Record<string, unknown>;
    const manifestSandboxConfig = this.sandboxService.buildSandboxConfig(manifest);
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
      const sourceContext = await this.pluginService.resolveUsageSourceContext(plugin);

      this.recordUsage(job.data, plugin, workerResult, sourceContext).catch(
        (err) => {
          this.logger.warn(`Failed to record plugin usage: ${err.message}`, {
            jobId: job.id,
          });
        },
      );
    }

    return workerResult;
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
    if (typeof config.functionName === 'string' && config.functionName.trim().length > 0) {
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

  private tightenNumericLimit(current: number | undefined, requested: number): number {
    return current === undefined ? requested : Math.min(current, requested);
  }

  private intersectAllowedHosts(current: string[], requested: string[]): string[] {
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

    return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
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
