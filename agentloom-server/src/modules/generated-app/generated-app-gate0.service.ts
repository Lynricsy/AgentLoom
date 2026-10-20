import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import type { GeneratedApp } from '../../database/schema';
import {
  buildGate0Failure,
  evaluateGate0AppSpec,
  type Gate0Evaluation,
} from './generated-app.app-spec.util';
import { GeneratedAppBindingResolverService } from './generated-app-binding-resolver.service';
import { GeneratedAppRepository } from './generated-app.repository';
import { GeneratedAppSpecGeneratorService } from './generated-app-spec-generator.service';
import {
  GeneratedAppSpecV2Schema,
  type GeneratedAppSpecV2,
} from './types/app-spec-v2.schema';
import type { ResolvedGeneratedAppBinding } from './types/generation-v2.ports';

export interface GeneratedAppGate0Input {
  tenantId: string;
  userId: string;
  app: Pick<
    GeneratedApp,
    'id' | 'prompt' | 'appSpec' | 'generationModelConfigId' | 'bindingTarget'
  >;
  generationRunId: string;
  /** start 请求带 regenerateAppSpec 或 triggerSource=retry 时为 true */
  regenerate: boolean;
  /** 调用方的取消信号（如运行的 maxRuntimeSeconds）；与 APP_GENERATED_APP_SPEC_TIMEOUT_MS 合并 */
  signal?: AbortSignal;
}

export interface GeneratedAppGate0Result {
  evaluation: Gate0Evaluation;
  /** Gate 0 通过时为本次运行使用的 AppSpec（新生成的已落库） */
  appSpec: GeneratedAppSpecV2 | null;
  resolvedBinding: ResolvedGeneratedAppBinding | null;
  /** 本次是否调用模型生成了新的 AppSpec */
  generated: boolean;
}

/**
 * Gate 0 需求规格（ADR-0007 §1、§4）：AppSpec 缺失、是 v1 模板或调用方要求重新生成时调用模型生成，
 * 否则复核已存 v2 规格并重新解析绑定。读写库各用短租户事务，模型调用不持有事务。
 */
@Injectable()
export class GeneratedAppGate0Service {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly repository: GeneratedAppRepository,
    private readonly generator: GeneratedAppSpecGeneratorService,
    private readonly bindingResolver: GeneratedAppBindingResolverService,
  ) {}

  async evaluate(
    input: GeneratedAppGate0Input,
  ): Promise<GeneratedAppGate0Result> {
    const { app, tenantId } = input;

    if (!input.regenerate && app.appSpec) {
      const parsed = GeneratedAppSpecV2Schema.safeParse(app.appSpec);
      const bindingCheck = parsed.success
        ? await this.bindingResolver.resolve(tenantId, parsed.data)
        : null;
      const evaluation = evaluateGate0AppSpec(app.appSpec, bindingCheck);
      return {
        evaluation,
        appSpec:
          evaluation.status === 'passed' && parsed.success ? parsed.data : null,
        resolvedBinding: bindingCheck?.ok ? bindingCheck.resolved : null,
        generated: false,
      };
    }

    const timeoutMs = this.configService.getOrThrow<number>(
      'APP_GENERATED_APP_SPEC_TIMEOUT_MS',
    );
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const result = await this.generator.generate({
      tenantId,
      userId: input.userId,
      prompt: app.prompt,
      modelConfigId: app.generationModelConfigId,
      bindingTarget: app.bindingTarget,
      feedback: null,
      signal: input.signal
        ? AbortSignal.any([timeoutSignal, input.signal])
        : timeoutSignal,
    });

    const generationDetails = {
      modelConfigId: result.modelConfigId,
      attempts: result.attempts,
      usage: result.usage,
    };

    if (result.status === 'failed') {
      return {
        evaluation: buildGate0Failure(
          result.code,
          result.code === 'app-spec-generation-timeout'
            ? `生成 AppSpec 超过 ${Math.round(timeoutMs / 1000)} 秒，模型调用已取消。`
            : result.message,
          result.issues,
          [],
          {
            ...generationDetails,
            rawOutputPreview: result.rawOutputPreview,
          },
        ),
        appSpec: null,
        resolvedBinding: null,
        generated: false,
      };
    }

    await runInTenantTransaction(this.db, tenantId, () =>
      this.repository.saveGeneratedAppSpec({
        tenantId,
        userId: input.userId,
        appId: app.id,
        appSpec: result.appSpec,
        generationModelConfigId: result.modelConfigId,
      }),
    );

    const evaluation = evaluateGate0AppSpec(result.appSpec, {
      ok: true,
      resolved: result.resolvedBinding,
    });
    return {
      evaluation: {
        ...evaluation,
        evidence: [
          {
            id: 'gate-0-generation',
            label: 'AppSpec 生成',
            kind: 'app_spec',
            url: null,
            summary: `模型配置 ${result.modelConfigId} 第 ${result.attempts} 次尝试生成通过，用量 ${result.usage.promptTokens} 输入 / ${result.usage.completionTokens} 输出 token。`,
            details: generationDetails,
          },
          ...evaluation.evidence,
        ],
      },
      appSpec: result.appSpec,
      resolvedBinding: result.resolvedBinding,
      generated: true,
    };
  }
}
