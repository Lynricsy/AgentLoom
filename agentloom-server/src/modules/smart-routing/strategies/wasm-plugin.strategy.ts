import { Logger } from '@nestjs/common';
import { z } from 'zod';

import type { StorageService } from '../../../infrastructure/storage/storage.service';
import type {
  PluginSandboxService,
  SandboxConfig,
} from '../../plugin/plugin-sandbox.service';
import type { PluginService } from '../../plugin/plugin.service';
import {
  BaseRouterStrategy,
  type RouterCategory,
} from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { ModelScore, RoutingDecision } from '../core/routing-decision';

export class WasmPluginRouter extends BaseRouterStrategy {
  readonly name = 'wasm-plugin';
  readonly category: RouterCategory = 'plugin';
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({
    pluginId: z.string().trim().min(1),
    pluginConfig: z.record(z.string(), z.unknown()).optional(),
  });

  private readonly logger = new Logger(WasmPluginRouter.name);

  constructor(
    private readonly pluginSandboxService: PluginSandboxService,
    private readonly pluginService: PluginService,
    private readonly storageService: StorageService,
  ) {
    super();
  }

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    const parsedConfig = this.configSchema.safeParse(
      context.strategyConfig ?? {},
    );

    if (!parsedConfig.success) {
      return this.fallbackToRandom(
        candidates,
        'missing or invalid strategyConfig.pluginId',
      );
    }

    const { pluginId, pluginConfig } = parsedConfig.data;

    try {
      const plugin = await this.pluginService.findActiveWasmPluginForRouting(
        context.tenantId,
        pluginId,
      );
      const wasmBundleUrl = plugin.wasmBundleUrl;

      if (!wasmBundleUrl) {
        return this.fallbackToRandom(
          candidates,
          `plugin "${pluginId}" has no wasm bundle`,
        );
      }

      const wasmBuffer = await this.downloadWasmBuffer(wasmBundleUrl);
      const input = JSON.stringify({ candidates, context });

      const result = await this.pluginSandboxService.execute(
        wasmBuffer,
        'route',
        input,
        this.buildSandboxConfigForPlugin(pluginConfig),
        pluginId,
      );

      if (!result.success) {
        return this.fallbackToRandom(
          candidates,
          'wasm plugin returned success=false',
        );
      }

      return this.parsePluginOutput(result.output, candidates);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`WASM plugin "${pluginId}" routing failed: ${message}`);

      return this.fallbackToRandom(candidates, `wasm plugin error: ${message}`);
    }
  }

  private async downloadWasmBuffer(storageKey: string): Promise<Buffer> {
    const readable = await this.storageService.download(storageKey);
    const chunks: Buffer[] = [];

    for await (const chunk of readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  private buildSandboxConfigForPlugin(
    pluginConfig: Record<string, unknown> | undefined,
  ): SandboxConfig | undefined {
    if (!pluginConfig) {
      return undefined;
    }

    const stringifiedConfig: Record<string, string> = {};
    for (const [key, value] of Object.entries(pluginConfig)) {
      stringifiedConfig[key] =
        typeof value === 'string' ? value : JSON.stringify(value);
    }

    return { config: stringifiedConfig };
  }

  private parsePluginOutput(
    output: unknown,
    candidates: RoutingCandidate[],
  ): RoutingDecision {
    if (
      typeof output !== 'object' ||
      output === null ||
      Array.isArray(output)
    ) {
      return this.fallbackToRandom(
        candidates,
        'wasm plugin returned non-object output',
      );
    }

    const raw = output as Record<string, unknown>;

    if (typeof raw.selectedModelId !== 'string') {
      return this.fallbackToRandom(
        candidates,
        'wasm plugin output missing selectedModelId',
      );
    }

    const candidateIds = new Set(candidates.map((c) => c.id));
    if (!candidateIds.has(raw.selectedModelId)) {
      return this.fallbackToRandom(
        candidates,
        `wasm plugin selected unknown model "${raw.selectedModelId}"`,
      );
    }

    const scores = Array.isArray(raw.scores)
      ? (raw.scores as ModelScore[])
      : candidates.map((c) => ({
          modelId: c.id,
          modelName: c.name,
          provider: c.provider,
          score: c.id === raw.selectedModelId ? 100 : 0,
          reasoning:
            c.id === raw.selectedModelId ? 'selected by wasm plugin' : '',
        }));

    return {
      selectedModelId: raw.selectedModelId,
      scores,
      reasoning:
        typeof raw.reasoning === 'string'
          ? raw.reasoning
          : 'wasm plugin decision',
      routerType: this.name,
      latencyMs: 0,
    };
  }

  private fallbackToRandom(
    candidates: RoutingCandidate[],
    reason: string,
  ): RoutingDecision {
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selected = candidates[randomIndex];

    return {
      selectedModelId: selected.id,
      scores: candidates.map((c) => ({
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score: 50,
        reasoning: `wasm plugin fallback: ${reason}`,
      })),
      reasoning: `wasm plugin fallback — ${reason}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
