import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { z } from 'zod';

import type { DrizzleDB } from '../../../database/database.module';
import type { FormatResult } from '../../agent/dto/output-format.dto';
import type { OutputFormatService } from '../../agent/output-format.service';
import { LlmModelConfigNotFoundException } from '../../llm/llm.exceptions';
import type { LlmService } from '../../llm/llm.service';
import type { PiAiAdapter, ResolvedModelConfig } from '../../llm/pi-ai-adapter';
import {
  collectWorkflowBindingIssues,
  type GeneratedAppBindingResolverService,
} from '../generated-app-binding-resolver.service';
import { GeneratedAppSpecGeneratorService } from '../generated-app-spec-generator.service';
import {
  GeneratedAppSpecDraftSchema,
  GeneratedAppSpecV2Schema,
  GENERATED_APP_SPEC_MAX_ATTEMPTS,
} from '../types/app-spec-v2.schema';
import type {
  AppSpecGenerationInput,
  AppSpecGenerationResult,
  GeneratedAppBindingCandidate,
} from '../types/generation-v2.ports';
import {
  V2_MODEL_CONFIG_ID,
  V2_PROMPT,
  TENANT_ID,
  USER_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_VERSION_ID,
  createAppSpecDraftFixture,
  createWorkflowBindingCandidateFixture,
} from './generated-app-test-support';

type DraftInput = z.input<typeof GeneratedAppSpecDraftSchema>;

const CHAT_MODEL = {
  id: V2_MODEL_CONFIG_ID,
  name: 'minimax-m3.1-flash-free',
  modelType: 'chat',
  isEnabled: true,
  provider: { slug: 'openrouter' },
} as ResolvedModelConfig;

/** 租户事务里只会执行 SET LOCAL；查询都经 mock 的服务完成 */
const db = {
  transaction: async <T>(operation: (tx: unknown) => Promise<T>): Promise<T> =>
    operation({ execute: vi.fn() }),
} as unknown as DrizzleDB;

function formatResult(
  data: unknown,
  overrides: Partial<FormatResult> = {},
): FormatResult {
  return {
    outputFormatLevel: 'L2',
    degraded: false,
    data,
    attempts: [
      {
        level: 'L2',
        durationMs: 5,
        success: data !== null,
        rawOutput: JSON.stringify(data),
      },
    ],
    usage: { inputTokens: 100, outputTokens: 50 },
    ...overrides,
  };
}

/** 草稿里的 question 字段换成单选，并让浏览器步骤改用 select */
function draftWithSelectQuestion(): DraftInput {
  const draft = createAppSpecDraftFixture();
  return {
    ...draft,
    inputForm: {
      ...draft.inputForm,
      fields: [
        {
          id: 'question',
          label: '问题',
          type: 'single_select',
          required: true,
          options: [{ value: 'sub-agents', label: '子 Agent 上限' }],
        },
      ],
    },
    acceptanceScenarios: draft.acceptanceScenarios.map((scenario) => ({
      ...scenario,
      browserSteps: [
        { action: 'select', fieldId: 'question', values: ['sub-agents'] },
        ...scenario.browserSteps.filter((step) => step.action !== 'fill'),
      ],
    })),
  };
}

describe('GeneratedAppSpecGeneratorService', () => {
  let llmService: {
    findById: Mock;
    findDefaultByType: Mock;
  };
  let piAiAdapter: { getModel: Mock };
  let outputFormatService: { executeStructuredOutput: Mock };
  let candidates: GeneratedAppBindingCandidate[];
  let resolver: {
    listCandidates: Mock;
    resolve: Mock;
  };
  let generator: GeneratedAppSpecGeneratorService;

  beforeEach(() => {
    llmService = {
      findById: vi.fn().mockResolvedValue(CHAT_MODEL),
      findDefaultByType: vi.fn().mockResolvedValue(CHAT_MODEL),
    };
    piAiAdapter = { getModel: vi.fn().mockResolvedValue({ id: 'model' }) };
    outputFormatService = { executeStructuredOutput: vi.fn() };
    candidates = [createWorkflowBindingCandidateFixture()];
    // 解析器的读库部分换成固定候选，映射兼容性用真实规则
    resolver = {
      listCandidates: vi.fn(async () => candidates),
      resolve: vi.fn(async (_tenantId: string, spec) => {
        const candidate = candidates.find(
          (item) =>
            item.kind === 'workflow' &&
            spec.binding.kind === 'workflow' &&
            item.workflowDefinitionId === spec.binding.workflowDefinitionId,
        );
        if (!candidate || candidate.kind !== 'workflow') {
          return {
            ok: false,
            issues: [{ path: ['binding'], message: '绑定目标不存在' }],
          };
        }
        const issues = collectWorkflowBindingIssues(
          spec.binding,
          spec.inputForm.fields,
          candidate,
        );
        return issues.length > 0
          ? { ok: false, issues }
          : {
              ok: true,
              resolved: { kind: 'workflow', binding: spec.binding, candidate },
            };
      }),
    };
    generator = new GeneratedAppSpecGeneratorService(
      db,
      llmService as unknown as LlmService,
      piAiAdapter as unknown as PiAiAdapter,
      outputFormatService as unknown as OutputFormatService,
      resolver as unknown as GeneratedAppBindingResolverService,
    );
  });

  function generate(
    overrides: Partial<AppSpecGenerationInput> = {},
  ): Promise<AppSpecGenerationResult> {
    return generator.generate({
      tenantId: TENANT_ID,
      userId: USER_ID,
      prompt: V2_PROMPT,
      modelConfigId: V2_MODEL_CONFIG_ID,
      bindingTarget: null,
      feedback: null,
      signal: new AbortController().signal,
      ...overrides,
    });
  }

  it('首轮输出合规：固定到候选的已发布版本，整体通过 v2 schema，按草稿 schema 调用结构化输出', async () => {
    outputFormatService.executeStructuredOutput.mockResolvedValueOnce(
      formatResult(createAppSpecDraftFixture()),
    );

    const result = await generate();

    expect(result.status).toBe('generated');
    if (result.status !== 'generated') return;
    expect(result.attempts).toBe(1);
    expect(result.modelConfigId).toBe(V2_MODEL_CONFIG_ID);
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 });
    expect(GeneratedAppSpecV2Schema.safeParse(result.appSpec).success).toBe(
      true,
    );
    expect(result.appSpec.binding).toMatchObject({
      kind: 'workflow',
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
    });
    expect(result.appSpec.inputForm.fields.map((field) => field.id)).toEqual([
      'question',
    ]);
    expect(result.resolvedBinding.kind).toBe('workflow');

    const request =
      outputFormatService.executeStructuredOutput.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      providerId: 'openrouter',
      strategy: {
        strictness: 'strict',
        allowDegrade: true,
        repairPolicy: 'auto',
      },
    });
    expect(JSON.parse(request.strategy.outputSchema)).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['requirements', 'binding']),
    });
    expect(request.system).toContain('只能从用户消息中的「候选绑定目标」');
    expect(request.prompt).toContain(V2_PROMPT);
    expect(request.prompt).toContain(WORKFLOW_DEFINITION_ID);
    // 版本由服务端固定，不交给模型
    expect(request.prompt).not.toContain(WORKFLOW_VERSION_ID);
    expect(request.abortSignal).toBeInstanceOf(AbortSignal);
    expect(llmService.findById).toHaveBeenCalledWith(
      V2_MODEL_CONFIG_ID,
      TENANT_ID,
    );
  });

  it('首轮引用错误：第二轮带上问题列表重试并成功，用量累计', async () => {
    const draft = createAppSpecDraftFixture();
    const withoutSubmit: DraftInput = {
      ...draft,
      acceptanceScenarios: draft.acceptanceScenarios.map((scenario) => ({
        ...scenario,
        browserSteps: scenario.browserSteps.filter(
          (step) => step.action !== 'submit',
        ),
      })),
    };
    outputFormatService.executeStructuredOutput
      .mockResolvedValueOnce(formatResult(withoutSubmit))
      .mockResolvedValueOnce(formatResult(draft));

    const result = await generate();

    expect(result).toMatchObject({
      status: 'generated',
      attempts: 2,
      usage: { promptTokens: 200, completionTokens: 100 },
    });
    expect(
      result.status === 'generated' && result.appSpec.generation.attempt,
    ).toBe(2);
    const firstPrompt: string =
      outputFormatService.executeStructuredOutput.mock.calls[0]?.[0].prompt;
    const secondPrompt: string =
      outputFormatService.executeStructuredOutput.mock.calls[1]?.[0].prompt;
    expect(firstPrompt).not.toContain('上一次输出的问题');
    expect(secondPrompt).toContain('上一次输出的问题（第 1 次尝试）');
    expect(secondPrompt).toContain('场景缺少 submit 步骤');
  });

  it('三轮都不合规：app-spec-model-output-invalid，带问题列表与脱敏截断的输出预览', async () => {
    const leakedOutput = `{"appName": "x", "note": "sk-live1234567890abcdef /root/secret/key.pem"}${'x'.repeat(3000)}`;
    outputFormatService.executeStructuredOutput.mockResolvedValue(
      formatResult(null, {
        degraded: true,
        attempts: [
          {
            level: 'L2',
            durationMs: 5,
            success: false,
            error: 'L2 validation failed: requirements: Required',
            rawOutput: leakedOutput,
          },
        ],
      }),
    );

    const result = await generate();

    expect(outputFormatService.executeStructuredOutput).toHaveBeenCalledTimes(
      GENERATED_APP_SPEC_MAX_ATTEMPTS,
    );
    expect(result).toMatchObject({
      status: 'failed',
      code: 'app-spec-model-output-invalid',
      attempts: GENERATED_APP_SPEC_MAX_ATTEMPTS,
      modelConfigId: V2_MODEL_CONFIG_ID,
      usage: { promptTokens: 300, completionTokens: 150 },
    });
    if (result.status !== 'failed') return;
    expect(result.issues[0]).toContain('L2 validation failed');
    expect(result.rawOutputPreview).not.toBeNull();
    expect(result.rawOutputPreview?.length).toBeLessThanOrEqual(2000);
    expect(result.rawOutputPreview).not.toContain('sk-live1234567890abcdef');
    expect(result.rawOutputPreview).not.toContain('/root/secret');
    expect(result.rawOutputPreview).toContain('[REDACTED]');
  });

  it('没有指定模型且租户没有默认 chat 模型：app-spec-model-unavailable，不调用模型', async () => {
    llmService.findDefaultByType.mockResolvedValueOnce(null);

    const result = await generate({ modelConfigId: null });

    expect(result).toMatchObject({
      status: 'failed',
      code: 'app-spec-model-unavailable',
      attempts: 0,
      modelConfigId: null,
    });
    expect(llmService.findDefaultByType).toHaveBeenCalledWith(
      TENANT_ID,
      'chat',
    );
    expect(outputFormatService.executeStructuredOutput).not.toHaveBeenCalled();
  });

  it.each([
    [
      '已删除',
      () =>
        Promise.reject(new LlmModelConfigNotFoundException(V2_MODEL_CONFIG_ID)),
    ],
    ['已停用', () => Promise.resolve({ ...CHAT_MODEL, isEnabled: false })],
    [
      '不是 chat 模型',
      () => Promise.resolve({ ...CHAT_MODEL, modelType: 'embedding' }),
    ],
  ])('指定的生成模型%s：app-spec-model-unavailable', async (_label, lookup) => {
    llmService.findById.mockImplementationOnce(lookup);

    const result = await generate();

    expect(result).toMatchObject({
      status: 'failed',
      code: 'app-spec-model-unavailable',
    });
    expect(outputFormatService.executeStructuredOutput).not.toHaveBeenCalled();
  });

  it('租户没有已发布的工作流或 Agent：app-spec-binding-candidates-empty，不调用模型', async () => {
    candidates = [];

    const result = await generate();

    expect(result).toMatchObject({
      status: 'failed',
      code: 'app-spec-binding-candidates-empty',
      message: '当前租户没有已发布的工作流或 Agent 可供绑定。',
    });
    expect(resolver.listCandidates).toHaveBeenCalledWith(TENANT_ID, null);
    expect(outputFormatService.executeStructuredOutput).not.toHaveBeenCalled();
  });

  it('指定的绑定目标已发布版本没有输出节点：直接 app-spec-binding-invalid，不调用模型', async () => {
    candidates = [createWorkflowBindingCandidateFixture({ outputNodes: [] })];

    const result = await generate({
      bindingTarget: {
        kind: 'workflow',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      },
    });

    expect(result).toMatchObject({
      status: 'failed',
      code: 'app-spec-binding-invalid',
    });
    expect(outputFormatService.executeStructuredOutput).not.toHaveBeenCalled();
  });

  it.each<
    [string, () => DraftInput, () => GeneratedAppBindingCandidate, string]
  >([
    [
      '映射到 inputSchema 中不存在的字段',
      () => ({
        ...createAppSpecDraftFixture(),
        binding: {
          ...createAppSpecDraftFixture().binding,
          inputMapping: [
            { fieldId: 'question', workflowInputFieldId: 'query' },
          ],
        } as DraftInput['binding'],
      }),
      () => createWorkflowBindingCandidateFixture(),
      '工作流输入契约中没有字段 query',
    ],
    [
      '字段类型与工作流输入不兼容',
      draftWithSelectQuestion,
      () => createWorkflowBindingCandidateFixture(),
      '表单字段 question（single_select）不能映射到工作流输入 question（text）',
    ],
    [
      '工作流必填输入没有被映射',
      () => createAppSpecDraftFixture(),
      () => {
        const candidate = createWorkflowBindingCandidateFixture();
        return {
          ...candidate,
          inputSchema: {
            version: 2,
            collectionMode: 'form',
            fields: [
              ...(candidate.inputSchema?.fields ?? []),
              { id: 'language', type: 'text', label: '语言', required: true },
            ],
          },
        };
      },
      '工作流必填输入 language（语言）没有被任何表单字段映射',
    ],
  ])(
    '三轮都%s：app-spec-binding-invalid',
    async (_label, draft, candidate, issue) => {
      candidates = [candidate()];
      outputFormatService.executeStructuredOutput.mockResolvedValue(
        formatResult(draft()),
      );

      const result = await generate();

      expect(result).toMatchObject({
        status: 'failed',
        code: 'app-spec-binding-invalid',
        attempts: GENERATED_APP_SPEC_MAX_ATTEMPTS,
      });
      if (result.status !== 'failed') return;
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.stringContaining(issue)]),
      );
      // 每轮的绑定问题都作为下一轮的反馈
      const lastPrompt: string =
        outputFormatService.executeStructuredOutput.mock.calls[2]?.[0].prompt;
      expect(lastPrompt).toContain(issue);
    },
  );

  it('模型选了候选目录之外的目标：绑定问题作为反馈，不查询该目标', async () => {
    const outsider = '01a15536-0000-7000-8000-00000000abcd';
    outputFormatService.executeStructuredOutput
      .mockResolvedValueOnce(
        formatResult({
          ...createAppSpecDraftFixture(),
          binding: {
            ...createAppSpecDraftFixture().binding,
            workflowDefinitionId: outsider,
          },
        }),
      )
      .mockResolvedValueOnce(formatResult(createAppSpecDraftFixture()));

    const result = await generate();

    expect(result).toMatchObject({ status: 'generated', attempts: 2 });
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    const secondPrompt: string =
      outputFormatService.executeStructuredOutput.mock.calls[1]?.[0].prompt;
    expect(secondPrompt).toContain(`${outsider} 不在候选绑定目标中`);
  });

  it('超时：调用中途取消后返回 app-spec-generation-timeout，不再发起下一轮', async () => {
    const controller = new AbortController();
    outputFormatService.executeStructuredOutput.mockImplementation(async () => {
      controller.abort();
      return formatResult(null);
    });

    const result = await generate({ signal: controller.signal });

    expect(result).toMatchObject({
      status: 'failed',
      code: 'app-spec-generation-timeout',
      attempts: 1,
    });
    expect(outputFormatService.executeStructuredOutput).toHaveBeenCalledTimes(
      1,
    );
  });

  it('开始前已经超时：不调用模型', async () => {
    const result = await generate({ signal: AbortSignal.abort() });

    expect(result).toMatchObject({
      status: 'failed',
      code: 'app-spec-generation-timeout',
      attempts: 0,
    });
    expect(outputFormatService.executeStructuredOutput).not.toHaveBeenCalled();
  });
});
