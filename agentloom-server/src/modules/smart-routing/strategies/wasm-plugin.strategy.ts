import { Logger } from '@nestjs/common';
import { z } from 'zod';

import type {
  PluginSandboxService,
  SandboxConfig,
} from '../../plugin/plugin-sandbox.service';
import { BaseRouterStrategy, type RouterCategory } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { ModelScore, RoutingDecision } from '../core/routing-decision';

export interface WasmPluginRouterConfig {
  pluginId: string;
  pluginConfig?: Record<string, unknown>;
}

export class WasmPluginRouter extends BaseRouterStrategy {
  readonly name = 'wasm-plugin';
  readonly category: RouterCategory = 'plugin';
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({
    pluginId: z.string(),
    pluginConfig: z.record(z.string(), z.unknown()).optional(),
  });

  private readonly logger = new Logger(WasmPluginRouter.name);

  constructor(
    private readonly pluginSandboxService: PluginSandboxService,
    private readonly wasmBuffer: Buffer | Uint8Array,
    private readonly config: WasmPluginRouterConfig,
  ) {
    super();
  }

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    try {
      const input = JSON.stringify({ candidates, context });
      const sandboxConfig = this.buildSandboxConfigForPlugin();

      const result = await this.pluginSandboxService.execute(
        this.wasmBuffer,
        'route',
        input,
        sandboxConfig,
        this.config.pluginId,
      );

      if (!result.success) {
        return this.fallbackToRandom(candidates, 'wasm plugin returned success=false');
      }

      return this.parsePluginOutput(result.output, candidates);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `WASM plugin "${this.config.pluginId}" routing failed: ${message}`,
      );

      return this.fallbackToRandom(candidates, `wasm plugin error: ${message}`);
    }
  }

  private buildSandboxConfigForPlugin(): SandboxConfig | undefined {
    if (!this.config.pluginConfig) {
      return undefined;
    }

    const stringifiedConfig: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.config.pluginConfig)) {
      stringifiedConfig[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    return { config: stringifiedConfig };
  }

  private parsePluginOutput(
    output: unknown,
    candidates: RoutingCandidate[],
  ): RoutingDecision {
    if (typeof output !== 'object' || output === null || Array.isArray(output)) {
      return this.fallbackToRandom(candidates, 'wasm plugin returned non-object output');
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
          reasoning: c.id === raw.selectedModelId ? 'selected by wasm plugin' : '',
        }));

    return {
      selectedModelId: raw.selectedModelId,
      scores,
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : 'wasm plugin decision',
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
