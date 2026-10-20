import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { OutputFormatService } from '../agent/output-format.service';
import { LlmService } from '../llm/llm.service';
import { PiAiAdapter, type ResolvedModelConfig } from '../llm/pi-ai-adapter';
import {
  buildAppSpecCandidateCatalog,
  buildAppSpecUserMessage,
  GENERATED_APP_SPEC_SYSTEM_PROMPT,
} from './generated-app.app-spec-prompt';
import {
  buildAppSpecV2FromDraft,
  formatReferenceIssues,
  formatZodIssues,
} from './generated-app.app-spec.util';
import { GeneratedAppBindingResolverService } from './generated-app-binding-resolver.service';
import {
  GENERATED_APP_SPEC_MAX_ATTEMPTS,
  GeneratedAppSpecDraftSchema,
  GeneratedAppSpecV2Schema,
  type GeneratedAppBinding,
  type GeneratedAppSpecDraft,
} from './types/app-spec-v2.schema';
import type {
  AppSpecGenerationFailureCode,
  AppSpecGenerationInput,
  AppSpecGenerationResult,
  AppSpecGenerationUsage,
  AppSpecRepairFeedback,
  GeneratedAppBindingCandidate,
  GeneratedAppSpecGenerator,
} from './types/generation-v2.ports';

/** 交给结构化输出的 JSON Schema：草稿的输入形状（带默认值的字段可省略） */
const APP_SPEC_DRAFT_OUTPUT_SCHEMA = JSON.stringify(
  z.toJSONSchema(GeneratedAppSpecDraftSchema, { io: 'input' }),
);

const RAW_OUTPUT_PREVIEW_MAX_LENGTH = 2000;
const RAW_OUTPUT_SECRET_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/-]{8,}|sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_]{40,})\b/gi;
const RAW_OUTPUT_HOST_PATH_PATTERN =
  /(?:\/(?:root|home|users|var|tmp|etc|workspace)\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/gi;

type AttemptOutcome =
  | {
      ok: true;
      appSpec: Extract<AppSpecGenerationResult, { status: 'generated' }>['appSpec'];
      resolvedBinding: Extract<
        AppSpecGenerationResult,
        { status: 'generated' }
      >['resolvedBinding'];
    }
  | {
      ok: false;
      code: 'app-spec-model-output-invalid' | 'app-spec-binding-invalid';
      issues: string[];
    };

/**
 * 按需求生成 AppSpec v2（ADR-0007 §1）：解析模型 → 取绑定候选 → 结构化输出 → 草稿 schema 与引用检查
 * → 固定绑定版本并解析 → 整体 v2 schema 复核；任一步有问题就把问题列表作为反馈重试，
 * 同一次调用最多 GENERATED_APP_SPEC_MAX_ATTEMPTS 次。模型调用期间不持有数据库事务。
 */
@Injectable()
export class GeneratedAppSpecGeneratorService
  implements GeneratedAppSpecGenerator
{
  private readonly logger = new Logger(GeneratedAppSpecGeneratorService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llmService: LlmService,
    private readonly piAiAdapter: PiAiAdapter,
    private readonly outputFormatService: OutputFormatService,
    private readonly bindingResolver: GeneratedAppBindingResolverService,
  ) {}

  async generate(
    input: AppSpecGenerationInput,
  ): Promise<AppSpecGenerationResult> {
    const usage: AppSpecGenerationUsage = {
      promptTokens: 0,
      completionTokens: 0,
    };
    let attempts = 0;
    let rawOutput: string | null = null;
    const fail = (
      code: AppSpecGenerationFailureCode,
      message: string,
      issues: string[],
      modelConfigId: string | null,
    ): AppSpecGenerationResult => ({
      status: 'failed',
      code,
      message,
      issues,
      modelConfigId,
      attempts,
      usage,
      rawOutputPreview: rawOutput === null ? null : redactRawOutput(rawOutput),
    });

    const modelConfig = await runInTenantTransaction(
      this.db,
      input.tenantId,
      () => this.resolveModelConfig(input.tenantId, input.modelConfigId),
    );
    if (!modelConfig.ok) {
      return fail(
        'app-spec-model-unavailable',
        modelConfig.message,
        [],
        input.modelConfigId,
      );
    }
    const modelConfigId = modelConfig.config.id;

    const candidates = await this.bindingResolver.listCandidates(
      input.tenantId,
      input.bindingTarget,
    );
    if (candidates.length === 0) {
      return fail(
        'app-spec-binding-candidates-empty',
        input.bindingTarget
          ? '创建时指定的绑定目标不存在、未发布或不属于当前租户。'
          : '当前租户没有已发布的工作流或 Agent 可供绑定。',
        [],
        modelConfigId,
      );
    }
    const unusableTarget = candidates.find(
      (candidate) =>
        input.bindingTarget !== null &&
        candidate.kind === 'workflow' &&
        candidate.outputNodes.length === 0,
    );
    if (unusableTarget) {
      return fail(
        'app-spec-binding-invalid',
        `指定的工作流「${unusableTarget.name}」已发布版本没有 text-output / json-output 节点，无法承接结果。`,
        [],
        modelConfigId,
      );
    }

    let languageModel: LanguageModel;
    try {
      languageModel = (await this.piAiAdapter.getModel(
        modelConfig.config,
      )) as LanguageModel;
    } catch (error) {
      return fail(
        'app-spec-model-unavailable',
        `模型配置 ${modelConfigId} 无法实例化：${error instanceof Error ? error.message : String(error)}`,
        [],
        modelConfigId,
      );
    }

    const catalog = buildAppSpecCandidateCatalog(candidates);
    const catalogCandidates = candidates.filter((candidate) =>
      catalog.includedIds.includes(
        candidate.kind === 'workflow'
          ? candidate.workflowDefinitionId
          : candidate.agentDefinitionId,
      ),
    );
    let feedback: AppSpecRepairFeedback | null = input.feedback;
    let lastFailure: Extract<AttemptOutcome, { ok: false }> | null = null;

    while (attempts < GENERATED_APP_SPEC_MAX_ATTEMPTS) {
      // 超时（或调用方取消）后不再发起新的模型调用
      if (input.signal.aborted) break;
      attempts += 1;

      const result = await this.outputFormatService.executeStructuredOutput({
        providerId: modelConfig.config.provider.slug,
        model: languageModel,
        system: GENERATED_APP_SPEC_SYSTEM_PROMPT,
        prompt: buildAppSpecUserMessage({
          prompt: input.prompt,
          catalogJson: catalog.json,
          feedback,
        }),
        strategy: {
          outputSchema: APP_SPEC_DRAFT_OUTPUT_SCHEMA,
          strictness: 'strict',
          allowDegrade: true,
          repairPolicy: 'auto',
        },
        abortSignal: input.signal,
      });
      usage.promptTokens += result.usage.inputTokens;
      usage.completionTokens += result.usage.outputTokens;
      const lastLevelOutput = result.attempts.at(-1)?.rawOutput;
      rawOutput =
        lastLevelOutput ??
        (result.data === null ? null : JSON.stringify(result.data));

      if (input.signal.aborted) break;

      const outcome =
        result.data === null
          ? {
              ok: false as const,
              code: 'app-spec-model-output-invalid' as const,
              issues: result.attempts
                .filter((attempt) => attempt.error)
                .map(
                  (attempt) =>
                    `模型输出不是符合 schema 的 JSON（${attempt.level}）：${attempt.error}`,
                ),
            }
          : await this.evaluateAttempt({
              data: result.data,
              tenantId: input.tenantId,
              prompt: input.prompt,
              modelConfigId,
              attempt: attempts,
              candidates: catalogCandidates,
              bindingTarget: input.bindingTarget,
            });

      if (outcome.ok) {
        return {
          status: 'generated',
          appSpec: outcome.appSpec,
          resolvedBinding: outcome.resolvedBinding,
          modelConfigId,
          attempts,
          usage,
        };
      }

      lastFailure = outcome;
      feedback = { issues: outcome.issues, previousAttempt: attempts };
      this.logger.warn(
        `AppSpec attempt ${attempts}/${GENERATED_APP_SPEC_MAX_ATTEMPTS} rejected (${outcome.code}, ${outcome.issues.length} issues)`,
      );
    }

    if (input.signal.aborted) {
      return fail(
        'app-spec-generation-timeout',
        '生成 AppSpec 超时，模型调用已取消。',
        [],
        modelConfigId,
      );
    }
    return fail(
      lastFailure?.code ?? 'app-spec-model-output-invalid',
      lastFailure?.code === 'app-spec-binding-invalid'
        ? `模型连续 ${attempts} 次给出的绑定与目标的输入契约或输出节点不兼容。`
        : `模型连续 ${attempts} 次未产出符合契约的 AppSpec。`,
      lastFailure?.issues ?? [],
      modelConfigId,
    );
  }

  /** 指定模型 → 租户默认 chat 模型；必须是已启用的 chat 模型 */
  private async resolveModelConfig(
    tenantId: string,
    modelConfigId: string | null,
  ): Promise<
    | { ok: true; config: ResolvedModelConfig }
    | { ok: false; message: string }
  > {
    let config: ResolvedModelConfig | null;
    if (modelConfigId) {
      try {
        config = await this.llmService.findById(modelConfigId, tenantId);
      } catch {
        return {
          ok: false,
          message: `生成用的模型配置 ${modelConfigId} 已不存在。`,
        };
      }
    } else {
      config = await this.llmService.findDefaultByType(tenantId, 'chat');
      if (!config) {
        return {
          ok: false,
          message: '应用没有指定生成模型，租户也没有默认 chat 模型。',
        };
      }
    }

    if (config.modelType !== 'chat' || !config.isEnabled) {
      return {
        ok: false,
        message: `模型配置「${config.name}」不是已启用的 chat 模型。`,
      };
    }
    return { ok: true, config };
  }

  private async evaluateAttempt(params: {
    data: unknown;
    tenantId: string;
    prompt: string;
    modelConfigId: string;
    attempt: number;
    candidates: readonly GeneratedAppBindingCandidate[];
    bindingTarget: AppSpecGenerationInput['bindingTarget'];
  }): Promise<AttemptOutcome> {
    const parsedDraft = GeneratedAppSpecDraftSchema.safeParse(params.data);
    if (!parsedDraft.success) {
      return {
        ok: false,
        code: 'app-spec-model-output-invalid',
        issues: formatZodIssues(parsedDraft.error.issues),
      };
    }
    const draft = parsedDraft.data;

    const pinned = pinBinding(draft, params.candidates, params.bindingTarget);
    if (!pinned.ok) {
      return {
        ok: false,
        code: 'app-spec-binding-invalid',
        issues: [pinned.issue],
      };
    }

    const resolution = await this.bindingResolver.resolve(params.tenantId, {
      binding: pinned.binding,
      inputForm: draft.inputForm,
    });
    if (!resolution.ok) {
      return {
        ok: false,
        code: 'app-spec-binding-invalid',
        issues: formatReferenceIssues(resolution.issues),
      };
    }

    const parsedSpec = GeneratedAppSpecV2Schema.safeParse(
      buildAppSpecV2FromDraft(draft, {
        binding: pinned.binding,
        modelConfigId: params.modelConfigId,
        attempt: params.attempt,
        prompt: params.prompt,
        generatedAt: new Date(),
      }),
    );
    if (!parsedSpec.success) {
      return {
        ok: false,
        code: 'app-spec-model-output-invalid',
        issues: formatZodIssues(parsedSpec.error.issues),
      };
    }

    return {
      ok: true,
      appSpec: parsedSpec.data,
      resolvedBinding: resolution.resolved,
    };
  }
}

/** 草稿绑定 → 固定为候选当前已发布版本；目标必须来自候选目录且与创建时指定的目标一致 */
function pinBinding(
  draft: GeneratedAppSpecDraft,
  candidates: readonly GeneratedAppBindingCandidate[],
  bindingTarget: AppSpecGenerationInput['bindingTarget'],
): { ok: true; binding: GeneratedAppBinding } | { ok: false; issue: string } {
  const draftBinding = draft.binding;
  if (draftBinding.kind === 'workflow') {
    const candidate = candidates.find(
      (item) =>
        item.kind === 'workflow' &&
        item.workflowDefinitionId === draftBinding.workflowDefinitionId,
    );
    if (!candidate || candidate.kind !== 'workflow') {
      return {
        ok: false,
        issue: `binding.workflowDefinitionId: ${draftBinding.workflowDefinitionId} 不在候选绑定目标中${describeTarget(bindingTarget)}`,
      };
    }
    return {
      ok: true,
      binding: { ...draftBinding, workflowVersionId: candidate.workflowVersionId },
    };
  }

  const candidate = candidates.find(
    (item) =>
      item.kind === 'agent' &&
      item.agentDefinitionId === draftBinding.agentDefinitionId,
  );
  if (!candidate || candidate.kind !== 'agent') {
    return {
      ok: false,
      issue: `binding.agentDefinitionId: ${draftBinding.agentDefinitionId} 不在候选绑定目标中${describeTarget(bindingTarget)}`,
    };
  }
  return {
    ok: true,
    binding: { ...draftBinding, agentVersionId: candidate.agentVersionId },
  };
}

function describeTarget(
  bindingTarget: AppSpecGenerationInput['bindingTarget'],
): string {
  if (!bindingTarget) return '';
  return bindingTarget.kind === 'workflow'
    ? `，必须绑定工作流 ${bindingTarget.workflowDefinitionId}`
    : `，必须绑定 Agent ${bindingTarget.agentDefinitionId}`;
}

/** Gate 0 失败详情里的模型输出预览：截断并去掉令牌、密钥形态的长串与宿主路径 */
export function redactRawOutput(raw: string): string {
  return raw
    .slice(0, RAW_OUTPUT_PREVIEW_MAX_LENGTH)
    .replace(RAW_OUTPUT_SECRET_PATTERN, '[REDACTED]')
    .replace(RAW_OUTPUT_HOST_PATH_PATTERN, '[REDACTED_PATH]');
}
