import { Injectable, Logger } from '@nestjs/common';
import type { Api as PiApi, Model as PiModel } from '@earendil-works/pi-ai';

import type { AgentThinkingLevel } from '../agent-definition/agent-runtime-config.interface';
import { importPiAi, importPiAiBuiltinProviders } from '../agent/pi-imports';
import { resolvePiModelApi } from '../sandbox/pi-config-generator.service';
import { ModelDiscoveryService } from './model-discovery.service';
import {
  derivePiCatalogThinkingCapability,
  deriveLiteLLMThinkingCapability,
  UNKNOWN_THINKING_CAPABILITY,
  type PiModelThinkingFields,
  type ThinkingCapabilityResolution,
} from './thinking-capability.util';

export type ThinkingCapabilityTarget = {
  providerSlug: string;
  apiProtocol?: string | null;
  modelId: string;
};

/**
 * 按模型真实能力解析思考强度：LiteLLM 元数据 → pi-ai 内置目录（同模型 ID 且 api 与配置解析出的
 * pi api 一致）→ unknown。任一来源失败（离线、目录加载异常）都只降级，不让运行或接口失败。
 */
@Injectable()
export class ThinkingCapabilityService {
  private readonly logger = new Logger(ThinkingCapabilityService.name);

  constructor(private readonly modelDiscoveryService: ModelDiscoveryService) {}

  async resolve(
    target: ThinkingCapabilityTarget,
  ): Promise<ThinkingCapabilityResolution> {
    return (
      (await this.resolveFromLiteLLM(target)) ??
      (await this.resolveFromPiCatalog(target)) ??
      UNKNOWN_THINKING_CAPABILITY
    );
  }

  /**
   * 用 pi 的 clampThinkingLevel 把配置的强度收敛到模型支持范围；被收敛时记 warning。
   * 与 pi 运行时 streamSimple 内部的 clamp 语义一致。
   */
  async clampThinkingLevel(
    piModel: PiModelThinkingFields,
    level: AgentThinkingLevel,
    context: string,
  ): Promise<AgentThinkingLevel> {
    const { clampThinkingLevel } = await importPiAi();
    const clamped = clampThinkingLevel(
      piModel as unknown as PiModel<PiApi>,
      level,
    );
    if (clamped !== level) {
      this.logger.warn(
        `${context} 配置的思考强度 ${level} 不受模型支持，已收敛为 ${clamped}`,
      );
    }
    return clamped;
  }

  private async resolveFromLiteLLM(
    target: ThinkingCapabilityTarget,
  ): Promise<ThinkingCapabilityResolution | null> {
    try {
      const match = await this.modelDiscoveryService.lookupLiteLLMEntry(
        target.providerSlug,
        target.modelId,
      );
      return match ? deriveLiteLLMThinkingCapability(match.entry) : null;
    } catch (error) {
      this.logger.warn(
        `LiteLLM 思考能力查询失败（${target.providerSlug}/${target.modelId}），回退到 pi 目录: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async resolveFromPiCatalog(
    target: ThinkingCapabilityTarget,
  ): Promise<ThinkingCapabilityResolution | null> {
    const api = resolvePiModelApi({
      provider: target.providerSlug,
      model: target.modelId,
      apiProtocol: target.apiProtocol,
    });

    try {
      const [catalog, piAi] = await Promise.all([
        importPiAiBuiltinProviders(),
        importPiAi(),
      ]);
      const candidates = catalog
        .getBuiltinProviders()
        .flatMap(
          (provider) =>
            catalog.getBuiltinModels(provider) as readonly PiModel<PiApi>[],
        )
        .filter((model) => model.id === target.modelId && model.api === api);
      // 同一模型常被多个 provider 收录，优先与 AgentLoom provider slug 同名的条目
      const model =
        candidates.find(
          (candidate) => candidate.provider === target.providerSlug,
        ) ?? candidates[0];

      return model
        ? derivePiCatalogThinkingCapability(
            model,
            piAi.getSupportedThinkingLevels,
          )
        : null;
    } catch (error) {
      this.logger.warn(
        `pi-ai 目录思考能力查询失败（${target.providerSlug}/${target.modelId}）: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
