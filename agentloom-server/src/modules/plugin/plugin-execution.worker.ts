import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Readable } from 'node:stream';

import { StorageService } from '../../infrastructure/storage/storage.service';
import { PLUGIN_EXECUTION_QUEUE } from './plugin.constants';
import {
  PluginInactiveException,
  PluginNotFoundException,
} from './plugin.exceptions';
import {
  PluginSandboxService,
  type PluginExecutionResult,
  type SandboxConfig,
} from './plugin-sandbox.service';
import { PluginService } from './plugin.service';

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
    const mergedConfig: SandboxConfig = {
      ...manifestSandboxConfig,
      ...this.extractConfigOverrides(config),
    };

    const functionName = this.resolveFunctionName(manifest, nodeType, config);

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

    return {
      status: result.success ? 'completed' : 'failed',
      outputs: this.normalizeOutputs(result.output),
      executionTimeMs: result.executionTimeMs,
    };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PluginExecutionJobData>, error: Error): void {
    this.logger.error(
      `插件执行失败: ${JSON.stringify({
        jobId: job.id,
        pluginId: job.data.pluginId,
        nodeType: job.data.nodeType,
        executionId: job.data.executionId,
        stepId: job.data.stepId,
        attempt: job.attemptsMade,
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
      throw new Error(
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

  private resolveFunctionName(
    manifest: Record<string, unknown>,
    nodeType: string,
    config: Record<string, unknown>,
  ): string {
    if (typeof config.functionName === 'string' && config.functionName.length > 0) {
      return config.functionName;
    }

    if (typeof manifest.wasmEntry === 'string' && manifest.wasmEntry.length > 0) {
      return manifest.wasmEntry;
    }

    return nodeType || 'run';
  }

  private extractConfigOverrides(config: Record<string, unknown>): Partial<SandboxConfig> {
    const overrides: Partial<SandboxConfig> = {};

    if (typeof config.timeoutMs === 'number') {
      overrides.timeoutMs = config.timeoutMs;
    }

    if (typeof config.maxMemoryPages === 'number') {
      overrides.maxMemoryPages = config.maxMemoryPages;
    }

    if (Array.isArray(config.allowedHosts)) {
      overrides.allowedHosts = config.allowedHosts.filter(
        (h): h is string => typeof h === 'string',
      );
    }

    return overrides;
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
