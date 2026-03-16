import { Injectable, Logger } from '@nestjs/common';
import createPlugin, { type Plugin as ExtismPlugin } from '@extism/extism';

import { DomainException } from '../../common/exceptions/domain.exception';
import { DEFAULT_SANDBOX_CONFIG } from './plugin.constants';
import {
  PluginExecutionTimeoutException,
  PluginPermissionDeniedException,
  PluginResourceExhaustedException,
  PluginSandboxException,
} from './plugin.exceptions';

export interface SandboxConfig {
  allowedHosts?: string[];
  allowedPaths?: Record<string, string>;
  maxMemoryPages?: number;
  timeoutMs?: number;
  useWasi?: boolean;
  config?: Record<string, string>;
}

export interface PluginExecutionResult {
  success: boolean;
  output: unknown;
  executionTimeMs: number;
}

interface ResolvedSandboxConfig {
  allowedHosts: string[];
  allowedPaths: Record<string, string>;
  maxMemoryPages: number;
  timeoutMs: number;
  useWasi: boolean;
  config?: Record<string, string>;
}

@Injectable()
export class PluginSandboxService {
  private readonly logger = new Logger(PluginSandboxService.name);

  async execute(
    wasmBuffer: Buffer | Uint8Array,
    functionName: string,
    input: unknown,
    sandboxConfig?: SandboxConfig,
    pluginId = 'unknown',
  ): Promise<PluginExecutionResult> {
    const config = this.mergeSandboxConfig(sandboxConfig);
    let plugin: ExtismPlugin | null = null;
    const startTime = Date.now();

    try {
      plugin = await createPlugin(
        {
          wasm: [{ data: new Uint8Array(wasmBuffer) }],
          memory: { maxPages: config.maxMemoryPages },
          allowedHosts: config.allowedHosts,
          allowedPaths: config.allowedPaths,
          config: config.config,
        },
        {
          useWasi: config.useWasi,
          runInWorker: true,
          timeoutMs: config.timeoutMs,
        },
      );

      const normalizedInput = this.normalizeInput(input);
      const result = await plugin.call(functionName, normalizedInput);
      const executionTimeMs = Date.now() - startTime;

      if (result === null || result === undefined) {
        return {
          success: true,
          output: null,
          executionTimeMs,
        };
      }

      let output: unknown;
      try {
        output = result.json();
      } catch {
        output = result.text();
      }

      return {
        success: true,
        output,
        executionTimeMs,
      };
    } catch (error: unknown) {
      throw this.classifyError(error, pluginId, config);
    } finally {
      if (plugin) {
        try {
          await plugin.close();
        } catch (closeError) {
          const closeMessage =
            closeError instanceof Error ? closeError.message : String(closeError);

          this.logger.warn(
            `关闭插件 "${pluginId}" 的 WASM 实例时出错: ${closeMessage}`,
          );
        }
      }
    }
  }

  buildSandboxConfig(manifest: Record<string, unknown>): SandboxConfig {
    const sandbox = this.isRecord(manifest.sandbox) ? manifest.sandbox : {};
    const permissions = this.isStringArray(manifest.permissions)
      ? manifest.permissions
      : [];
    const allowedHosts =
      permissions.includes('network:outbound') && this.isStringArray(sandbox.allowedHosts)
        ? [...new Set(sandbox.allowedHosts)]
        : [];

    return {
      allowedHosts,
      allowedPaths: {},
      maxMemoryPages: DEFAULT_SANDBOX_CONFIG.maxMemoryPages,
      timeoutMs: DEFAULT_SANDBOX_CONFIG.timeoutMs,
      useWasi: DEFAULT_SANDBOX_CONFIG.useWasi,
    };
  }

  private mergeSandboxConfig(config?: SandboxConfig): ResolvedSandboxConfig {
    return {
      maxMemoryPages: this.resolveNumericLimit(
        config?.maxMemoryPages,
        DEFAULT_SANDBOX_CONFIG.maxMemoryPages,
      ),
      timeoutMs: this.resolveNumericLimit(
        config?.timeoutMs,
        DEFAULT_SANDBOX_CONFIG.timeoutMs,
      ),
      allowedHosts: this.isStringArray(config?.allowedHosts)
        ? [...new Set(config.allowedHosts)]
        : [...DEFAULT_SANDBOX_CONFIG.allowedHosts],
      allowedPaths: this.isStringRecord(config?.allowedPaths)
        ? { ...config.allowedPaths }
        : { ...DEFAULT_SANDBOX_CONFIG.allowedPaths },
      useWasi: config?.useWasi ?? DEFAULT_SANDBOX_CONFIG.useWasi,
      config: this.isStringRecord(config?.config)
        ? { ...config.config }
        : undefined,
    };
  }

  private normalizeInput(input: unknown): string | number | Uint8Array | undefined {
    if (input === undefined) {
      return undefined;
    }

    if (
      typeof input === 'string' ||
      typeof input === 'number' ||
      input instanceof Uint8Array
    ) {
      return input;
    }

    return JSON.stringify(input);
  }

  private classifyError(
    error: unknown,
    pluginId: string,
    config: Pick<ResolvedSandboxConfig, 'timeoutMs'>,
  ): DomainException {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('call canceled due to timeout') ||
      message.includes('timed out while waiting for plugin') ||
      message.includes('timed out while waiting for plugin to instantiate')
    ) {
      return new PluginExecutionTimeoutException(pluginId, config.timeoutMs);
    }

    if (message.includes('is not allowed') && this.isPermissionDeniedMessage(message)) {
      const detail = message.includes('allowedPaths')
        ? `插件 "${pluginId}" 尝试访问未授权的文件路径。V1 默认禁止文件系统访问。`
        : `插件 "${pluginId}" 尝试访问未授权的主机。请在 manifest 的 sandbox.allowedHosts 中配置允许的主机。`;

      return new PluginPermissionDeniedException(
        pluginId,
        detail,
      );
    }

    if (
      message.includes('memory limit exceeded') ||
      message.includes('out of memory') ||
      message.includes('var memory limit exceeded')
    ) {
      return new PluginResourceExhaustedException(pluginId, '内存');
    }

    if (message.includes('does not exist')) {
      return new PluginSandboxException(
        pluginId,
        `插件 "${pluginId}" 中未找到函数。${message}`,
      );
    }

    if (message.includes('Plugin-originated error')) {
      return new PluginSandboxException(pluginId, `插件执行错误: ${message}`);
    }

    return new PluginSandboxException(
      pluginId,
      `插件 "${pluginId}" 执行时发生未知错误: ${message}`,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }

  private isStringRecord(value: unknown): value is Record<string, string> {
    if (!this.isRecord(value)) {
      return false;
    }

    return Object.values(value).every((item) => typeof item === 'string');
  }

  private resolveNumericLimit(value: unknown, defaultValue: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return defaultValue;
    }

    return Math.min(Math.trunc(value), defaultValue);
  }

  private isPermissionDeniedMessage(message: string): boolean {
    return (
      message.includes('no allowedHosts match') ||
      message.includes('no allowedPaths match') ||
      message.includes('allowedHosts') ||
      message.includes('allowedPaths')
    );
  }
}
