import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { GeneratedAppBindingResolverService } from '../generated-app-binding-resolver.service';
import {
  GeneratedAppGate0Service,
  type GeneratedAppGate0Input,
} from '../generated-app-gate0.service';
import type { GeneratedAppRepository } from '../generated-app.repository';
import type { GeneratedAppSpecGeneratorService } from '../generated-app-spec-generator.service';
import type {
  AppSpecGenerationResult,
  ResolvedGeneratedAppBinding,
} from '../types/generation-v2.ports';
import {
  APP_ID,
  V2_MODEL_CONFIG_ID,
  V2_PROMPT,
  TENANT_ID,
  USER_ID,
  WORKFLOW_DEFINITION_ID,
  createAppSpecV2FromDraftFixture,
  createWorkflowBindingCandidateFixture,
} from './generated-app-test-support';

const RUN_ID = '55555555-5555-4555-8555-555555555555';

const db = {
  transaction: async <T>(operation: (tx: unknown) => Promise<T>): Promise<T> =>
    operation({ execute: vi.fn() }),
} as unknown as DrizzleDB;

function resolvedQaBinding(): ResolvedGeneratedAppBinding {
  const spec = createAppSpecV2FromDraftFixture();
  if (spec.binding.kind !== 'workflow') throw new Error('workflow binding');
  return {
    kind: 'workflow',
    binding: spec.binding,
    candidate: createWorkflowBindingCandidateFixture(),
  };
}

function generatedResult(): AppSpecGenerationResult {
  return {
    status: 'generated',
    appSpec: createAppSpecV2FromDraftFixture(),
    resolvedBinding: resolvedQaBinding(),
    modelConfigId: V2_MODEL_CONFIG_ID,
    attempts: 2,
    usage: { promptTokens: 4200, completionTokens: 900 },
  };
}

describe('GeneratedAppGate0Service', () => {
  let generator: { generate: Mock };
  let resolver: { resolve: Mock };
  let repository: { saveGeneratedAppSpec: Mock };
  let service: GeneratedAppGate0Service;

  beforeEach(() => {
    generator = { generate: vi.fn().mockResolvedValue(generatedResult()) };
    resolver = {
      resolve: vi
        .fn()
        .mockResolvedValue({ ok: true, resolved: resolvedQaBinding() }),
    };
    repository = { saveGeneratedAppSpec: vi.fn().mockResolvedValue(undefined) };
    service = new GeneratedAppGate0Service(
      db,
      {
        getOrThrow: vi.fn((key: string) =>
          key === 'APP_GENERATED_APP_SPEC_TIMEOUT_MS' ? 120_000 : undefined,
        ),
      } as unknown as ConfigService,
      repository as unknown as GeneratedAppRepository,
      generator as unknown as GeneratedAppSpecGeneratorService,
      resolver as unknown as GeneratedAppBindingResolverService,
    );
  });

  function evaluate(
    app: Partial<GeneratedAppGate0Input['app']>,
    overrides: Partial<Omit<GeneratedAppGate0Input, 'app'>> = {},
  ) {
    return service.evaluate({
      tenantId: TENANT_ID,
      userId: USER_ID,
      generationRunId: RUN_ID,
      regenerate: false,
      app: {
        id: APP_ID,
        prompt: V2_PROMPT,
        appSpec: null,
        generationModelConfigId: V2_MODEL_CONFIG_ID,
        bindingTarget: {
          kind: 'workflow',
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        },
        ...app,
      },
      ...overrides,
    });
  }

  it('尚未生成：按应用的模型与绑定目标生成，落库后 Gate 0 passed，证据含模型、尝试次数与用量', async () => {
    const result = await evaluate({ appSpec: null });

    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        prompt: V2_PROMPT,
        modelConfigId: V2_MODEL_CONFIG_ID,
        bindingTarget: {
          kind: 'workflow',
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        },
        feedback: null,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(repository.saveGeneratedAppSpec).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      appId: APP_ID,
      appSpec: createAppSpecV2FromDraftFixture(),
      generationModelConfigId: V2_MODEL_CONFIG_ID,
    });
    expect(result.generated).toBe(true);
    expect(result.evaluation.status).toBe('passed');
    expect(result.appSpec).toEqual(createAppSpecV2FromDraftFixture());
    expect(result.resolvedBinding?.kind).toBe('workflow');
    expect(result.evaluation.evidence[0]).toMatchObject({
      id: 'gate-0-generation',
      details: {
        modelConfigId: V2_MODEL_CONFIG_ID,
        attempts: 2,
        usage: { promptTokens: 4200, completionTokens: 900 },
      },
    });
    expect(result.evaluation.evidence.map((item) => item.id)).toEqual([
      'gate-0-generation',
      'gate-0-app-spec-v2',
      'gate-0-binding',
    ]);
  });

  it('已有 v2 规格且不要求重新生成：不调用模型，只复核规格与绑定', async () => {
    const result = await evaluate({
      appSpec: createAppSpecV2FromDraftFixture(),
    });

    expect(generator.generate).not.toHaveBeenCalled();
    expect(repository.saveGeneratedAppSpec).not.toHaveBeenCalled();
    expect(resolver.resolve).toHaveBeenCalledWith(
      TENANT_ID,
      createAppSpecV2FromDraftFixture(),
    );
    expect(result).toMatchObject({
      generated: false,
      appSpec: createAppSpecV2FromDraftFixture(),
      evaluation: { status: 'passed' },
    });
  });

  it('已有 v2 规格但绑定的固定版本已不可用：app-spec-binding-invalid', async () => {
    resolver.resolve.mockResolvedValueOnce({
      ok: false,
      issues: [
        { path: ['binding', 'workflowVersionId'], message: '固定版本已归档' },
      ],
    });

    const result = await evaluate({
      appSpec: createAppSpecV2FromDraftFixture(),
    });

    expect(result.appSpec).toBeNull();
    expect(result.evaluation.failure?.code).toBe('app-spec-binding-invalid');
  });

  it('regenerate=true（retry 或 regenerateAppSpec）时即使已有 v2 规格也重新生成', async () => {
    await evaluate(
      { appSpec: createAppSpecV2FromDraftFixture() },
      { regenerate: true },
    );

    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('生成失败：Gate 0 failed，failure 带生成器的失败码、问题、用量与输出预览，不落库', async () => {
    generator.generate.mockResolvedValueOnce({
      status: 'failed',
      code: 'app-spec-model-output-invalid',
      message: '模型连续 3 次未产出符合契约的 AppSpec。',
      issues: [
        'binding.outputMapping: 结果分区 citations 没有对应的工作流输出',
      ],
      modelConfigId: V2_MODEL_CONFIG_ID,
      attempts: 3,
      usage: { promptTokens: 9000, completionTokens: 3000 },
      rawOutputPreview: '{"appName":"文档问答"',
    } satisfies AppSpecGenerationResult);

    const result = await evaluate({ appSpec: null });

    expect(repository.saveGeneratedAppSpec).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      appSpec: null,
      resolvedBinding: null,
      generated: false,
    });
    expect(result.evaluation.status).toBe('failed');
    expect(result.evaluation.failure).toEqual({
      code: 'app-spec-model-output-invalid',
      message: '模型连续 3 次未产出符合契约的 AppSpec。',
      details: {
        issues: [
          'binding.outputMapping: 结果分区 citations 没有对应的工作流输出',
        ],
        modelConfigId: V2_MODEL_CONFIG_ID,
        attempts: 3,
        usage: { promptTokens: 9000, completionTokens: 3000 },
        rawOutputPreview: '{"appName":"文档问答"',
      },
    });
    expect(result.evaluation.repairInstructions).toContain(
      '换用能力更强的 chat 模型',
    );
  });

  it('超时：失败信息写明超时秒数；调用方取消信号会传给生成器', async () => {
    generator.generate.mockImplementationOnce(async ({ signal }) => {
      expect(signal.aborted).toBe(true);
      return {
        status: 'failed',
        code: 'app-spec-generation-timeout',
        message: '生成 AppSpec 超时，模型调用已取消。',
        issues: [],
        modelConfigId: V2_MODEL_CONFIG_ID,
        attempts: 1,
        usage: { promptTokens: 10, completionTokens: 0 },
        rawOutputPreview: null,
      } satisfies AppSpecGenerationResult;
    });

    const result = await evaluate(
      { appSpec: null },
      { signal: AbortSignal.abort() },
    );

    expect(result.evaluation.failure).toMatchObject({
      code: 'app-spec-generation-timeout',
      message: '生成 AppSpec 超过 120 秒，模型调用已取消。',
    });
  });
});
