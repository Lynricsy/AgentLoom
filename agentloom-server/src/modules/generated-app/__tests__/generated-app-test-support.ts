// 生成应用单测的唯一共享 fixture（ADR-0007 v2）：常量、数据库链式 mock、台账记录与 AppSpec v2 规格。
// S2 场景「问答页面：输入问题，调用文档问答工作流返回答案与引用」贯穿所有 fixture。

import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { vi } from 'vitest';
import type { z } from 'zod';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppGenerationRun,
  GeneratedAppGateRun,
  GeneratedAppReadiness,
  GeneratedAppRepairAttempt,
  GeneratedAppSubmission,
  WorkflowDefinition,
} from '../../../database/schema';
import type { ExecutionService } from '../../execution/execution.service';
import type { StorageService } from '../../../infrastructure/storage/storage.service';
import type { WorkflowVersionService } from '../../workflow-definition/workflow-version.service';
import { buildAppSpecV2FromDraft } from '../generated-app.app-spec.util';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { GeneratedAppGenerationRepairService } from '../generated-app-generation-repair.service';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';
import { GeneratedAppRepository } from '../generated-app.repository';
import { GeneratedAppRuntimeBindingService } from '../generated-app-runtime-binding.service';
import {
  GeneratedAppSpecDraftSchema,
  GeneratedAppSpecV2Schema,
  type GeneratedAppSpecV2,
} from '../types/app-spec-v2.schema';
import type {
  AgentBindingCandidate,
  ResolvedGeneratedAppBinding,
  WorkflowBindingCandidate,
} from '../types/generation-v2.ports';

const { mockTenantDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    // 嵌套事务（savepoint）在单测里直接复用同一个 mock
    transaction: <T>(operation: (tx: unknown) => Promise<T>): Promise<T> =>
      operation(db),
  };
  return { mockTenantDb: db };
});

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(() => mockTenantDb),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const APP_ID = '33333333-3333-4333-8333-333333333333';
const SUBMISSION_ID = '44444444-4444-4444-8444-444444444444';
const GENERATION_RUN_ID = '55555555-5555-4555-8555-555555555555';
const WORKFLOW_DEFINITION_ID = '55555555-5555-4555-8555-555555555556';
const WORKFLOW_EXECUTION_ID = '55555555-5555-4555-8555-555555555557';
const WORKFLOW_VERSION_ID = '55555555-5555-4555-8555-555555555559';
const GATE_RUN_ID = '66666666-6666-4666-8666-666666666666';
const REPAIR_ATTEMPT_ID = '77777777-7777-4777-8777-777777777777';
const V2_MODEL_CONFIG_ID = '01a154d7-8c8f-7c7b-87f3-a94220c05251';
const V2_AGENT_DEFINITION_ID = '99999999-9999-4999-8999-999999999991';
const V2_AGENT_VERSION_ID = '99999999-9999-4999-8999-999999999992';
const V2_PROMPT = '一个问答页面：输入问题，调用上述工作流返回答案与引用';
const NOW = new Date('2026-04-25T00:00:00.000Z');

const DEFAULT_START_GENERATION_RUN_DTO = {
  triggerSource: 'manual',
  maxRepairAttempts: 3,
  maxRuntimeSeconds: 1800,
} as const;

function createConfigService(
  overrides: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: vi.fn((key: string) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }

      return key === 'APP_FRONTEND_URL'
        ? 'https://studio.example.test'
        : undefined;
    }),
  } as unknown as ConfigService;
}

// ─── 数据库链式 mock ─────────────────────────────────────────────

function createSelectChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function createSelectManyChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function createSelectPageChain<T>(result: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(result),
  };
}

function createSelectLatestRunNumberChain(runNumber: number | null) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(runNumber === null ? [] : [{ runNumber }]),
  };
}

function createCountChain(total: number) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: total }]),
  };
}

function createInsertReturningChain<T>(result: T[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

function createUpdateReturningChain<T>(result: T[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
}

/** update 链：`set` 的入参合并到 baseApp 后作为 returning 结果，便于断言写入内容 */
function createGeneratedAppUpdateReturningFromPayload(
  baseApp: GeneratedApp,
  onPayload?: (payload: Partial<GeneratedApp>) => void,
) {
  let payload: Partial<GeneratedApp> = {};
  const chain = {
    set: vi.fn((nextPayload: Partial<GeneratedApp>) => {
      payload = nextPayload;
      onPayload?.(nextPayload);
      return chain;
    }),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => [{ ...baseApp, ...payload }]),
  };

  return chain;
}

function createUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── 服务构造 ───────────────────────────────────────────────────

function createStorageServiceMock(
  overrides: Partial<StorageService> = {},
): StorageService {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    stat: vi.fn().mockResolvedValue(null),
    download: vi.fn().mockRejectedValue(new Error('object not found')),
    deletePrefix: vi.fn().mockResolvedValue(0),
    getPresignedUrl: vi.fn(
      async (key: string) =>
        `https://minio.example.test/${key}?X-Amz-Signature=sig`,
    ),
    ...overrides,
  } as unknown as StorageService;
}

function createRepositoryForTest(): GeneratedAppRepository {
  return new GeneratedAppRepository(
    mockTenantDb as unknown as DrizzleDB,
    createConfigService(),
  );
}

function createRuntimeBindingServiceForTest(
  workflowVersionService?: WorkflowVersionService,
): GeneratedAppRuntimeBindingService {
  return new GeneratedAppRuntimeBindingService(
    createRepositoryForTest(),
    workflowVersionService,
  );
}

function createRepairServiceForTest(): GeneratedAppGenerationRepairService {
  return new GeneratedAppGenerationRepairService(createRepositoryForTest());
}

function createPublicRuntimeServiceForTest(
  executionService?: ExecutionService,
): GeneratedAppPublicRuntimeService {
  const repository = createRepositoryForTest();
  return new GeneratedAppPublicRuntimeService(
    repository,
    new GeneratedAppRuntimeBindingService(repository),
    executionService,
  );
}

// ─── 台账记录 ───────────────────────────────────────────────────

function createReadiness(
  overrides: Partial<GeneratedAppReadiness> = {},
): GeneratedAppReadiness {
  return {
    state: 'preview',
    canCreatePublicShare: false,
    blockingIssueCount: 7,
    warningCount: 0,
    summary: '阻断门禁尚未全部通过，当前只能预览。',
    blockers: [
      {
        gateId: 'gate-1',
        name: '架构计划门禁',
        status: 'pending',
        summary: '等待覆盖矩阵。',
      },
    ],
    warnings: [],
    ...overrides,
  };
}

function createPublishCandidateReadiness(): GeneratedAppReadiness {
  return createReadiness({
    state: 'publish_candidate',
    canCreatePublicShare: true,
    blockingIssueCount: 0,
    warningCount: 0,
    summary: '全部阻断门禁已通过且没有非阻断 warning。',
    blockers: [],
    warnings: [],
  });
}

function createGeneratedAppSubmission(
  overrides: Partial<GeneratedAppSubmission> = {},
): GeneratedAppSubmission {
  return {
    id: SUBMISSION_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    appSpecVersion: 2,
    publicShareToken: '1'.repeat(64),
    anonymousSessionId: 'anonymous-session-1',
    status: 'received',
    input: { question: '最多可以同时运行几个子 Agent？' },
    result: null,
    report: null,
    errorMessage: null,
    origin: 'public',
    generationRunId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function createGeneratedAppGateRun(
  overrides: Partial<GeneratedAppGateRun> = {},
): GeneratedAppGateRun {
  return {
    id: GATE_RUN_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    generationRunId: GENERATION_RUN_ID,
    repairAttemptId: null,
    gateId: 'gate-1',
    gateOrder: 1,
    gateName: '架构计划门禁',
    blocking: true,
    attemptNumber: 1,
    status: 'passed',
    summary: 'Gate 1 通过：每条 prompt 需求都有 requirement 场景覆盖。',
    evidence: [
      {
        id: 'gate-1-coverage-matrix',
        label: '覆盖矩阵',
        kind: 'plan',
        url: null,
        summary: '1 条 prompt 需求，1 个 requirement 场景。',
      },
    ],
    failure: null,
    repairInstructions: null,
    startedAt: NOW,
    completedAt: NOW,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createGeneratedAppGenerationRun(
  overrides: Partial<GeneratedAppGenerationRun> = {},
): GeneratedAppGenerationRun {
  return {
    id: GENERATION_RUN_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    runNumber: 1,
    status: 'running',
    triggerSource: 'manual',
    maxRepairAttempts: 3,
    maxRuntimeSeconds: 1800,
    summary: '生成运行执行中：Gate 0 需求规格。',
    failureReason: null,
    startedAt: NOW,
    completedAt: null,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createGeneratedAppRepairAttempt(
  overrides: Partial<GeneratedAppRepairAttempt> = {},
): GeneratedAppRepairAttempt {
  return {
    id: REPAIR_ATTEMPT_ID,
    tenantId: TENANT_ID,
    generatedAppId: APP_ID,
    generationRunId: GENERATION_RUN_ID,
    attemptNumber: 1,
    targetGateId: 'gate-2',
    status: 'failed',
    failureSummary: 'gate-2 静态合约门禁 失败：结果分区与输出节点不兼容。',
    changeSummary: null,
    verificationSummary: null,
    repairPlan: null,
    reverificationPlan: null,
    startedAt: NOW,
    completedAt: NOW,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createWorkflowDefinitionReadinessRow(
  overrides: Partial<
    Pick<
      WorkflowDefinition,
      'id' | 'status' | 'publishedVersionId' | 'metadata' | 'updatedAt'
    >
  > = {},
) {
  return {
    id: WORKFLOW_DEFINITION_ID,
    status: 'draft',
    publishedVersionId: null,
    metadata: {},
    updatedAt: NOW,
    ...overrides,
  };
}

// ─── AppSpec v2 与绑定候选 ─────────────────────────────────────

/**
 * 按 ADR-0007「确认方式」的 S2 场景构造并经 `GeneratedAppSpecV2Schema` 校验的 AppSpec：
 * 一个必填 `question` 字段，结果视图「答案」（text-output）与「引用」（json-output 的 citations 键）。
 * 覆盖项先合并再校验，非法覆盖会直接抛错，避免用例拿到不合契约的 fixture。
 */
function createAppSpecV2Fixture(
  overrides: Partial<GeneratedAppSpecV2> = {},
): GeneratedAppSpecV2 {
  const base: z.input<typeof GeneratedAppSpecV2Schema> = {
    version: 2,
    appName: '文档问答',
    summary: '输入问题，调用文档问答工作流返回答案与引用。',
    userGoal: '终端用户提问并得到带引用的答案',
    actors: ['终端用户'],
    coreRequirements: [
      { id: 'req-ask', text: '输入问题并返回答案与引用', source: 'prompt' },
      {
        id: 'req-platform-persist',
        text: '公开提交保存在创建者租户内，创建者可查看和删除。',
        source: 'platform',
      },
    ],
    pages: [
      {
        id: 'public-runtime',
        name: '公开运行页',
        purpose: '终端用户填写表单并查看结果。',
      },
    ],
    inputForm: {
      title: '提问',
      submitLabel: '提问',
      fields: [
        {
          id: 'question',
          label: '问题',
          type: 'textarea',
          required: true,
          maxLength: 2000,
        },
      ],
    },
    resultView: {
      title: '回答',
      sections: [
        { id: 'answer', label: '答案', format: 'markdown' },
        { id: 'citations', label: '引用', format: 'citations' },
      ],
    },
    binding: {
      kind: 'workflow',
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
      inputMapping: [{ fieldId: 'question', workflowInputFieldId: 'question' }],
      outputMapping: [
        { sectionId: 'answer', nodeId: 'out-answer' },
        { sectionId: 'citations', nodeId: 'out-structured', path: 'citations' },
      ],
    },
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不生成自定义后端或新工作流。'],
    acceptanceScenarios: [
      {
        id: 'scenario-ask',
        title: '提问后看到答案与引用',
        scope: 'requirement',
        requirementIds: ['req-ask'],
        given: ['公开页已打开'],
        when: ['输入问题并提交'],
        then: ['展示答案', '展示引用'],
        browserSteps: [
          {
            action: 'fill',
            fieldId: 'question',
            value: '最多可以同时运行几个子 Agent？',
          },
          { action: 'submit' },
          {
            action: 'expectResult',
            sectionId: 'answer',
            assertion: 'nonEmpty',
          },
          {
            action: 'expectResult',
            sectionId: 'citations',
            assertion: 'nonEmpty',
          },
        ],
      },
      {
        id: 'scenario-platform-persist',
        title: '提交保存可追踪',
        scope: 'platform',
        requirementIds: ['req-platform-persist'],
        given: ['应用已公开'],
        when: ['终端用户提交'],
        then: ['提交归属创建者租户'],
        browserSteps: [],
      },
    ],
    traceability: [
      {
        requirementId: 'req-ask',
        scenarioIds: ['scenario-ask'],
        fieldIds: ['question'],
        sectionIds: ['answer', 'citations'],
      },
      {
        requirementId: 'req-platform-persist',
        scenarioIds: ['scenario-platform-persist'],
        fieldIds: [],
        sectionIds: [],
      },
    ],
    generation: {
      modelConfigId: V2_MODEL_CONFIG_ID,
      generatedAt: NOW.toISOString(),
      attempt: 1,
      promptSha256: crypto.createHash('sha256').update(V2_PROMPT).digest('hex'),
    },
  };

  return GeneratedAppSpecV2Schema.parse({ ...base, ...overrides });
}

/** Agent 绑定的变体：结果视图恰好一个回复分区 */
function createAgentAppSpecV2Fixture(): GeneratedAppSpecV2 {
  const workflowSpec = createAppSpecV2Fixture();

  return createAppSpecV2Fixture({
    resultView: {
      title: '回答',
      emptyState: '提交后在这里显示结果。',
      sections: [{ id: 'reply', label: '回复', format: 'markdown' }],
    },
    binding: {
      kind: 'agent',
      agentDefinitionId: V2_AGENT_DEFINITION_ID,
      agentVersionId: V2_AGENT_VERSION_ID,
      replySectionId: 'reply',
    },
    acceptanceScenarios: workflowSpec.acceptanceScenarios.map((scenario) =>
      scenario.scope === 'requirement'
        ? {
            ...scenario,
            browserSteps: [
              scenario.browserSteps[0],
              { action: 'submit' },
              {
                action: 'expectResult',
                sectionId: 'reply',
                assertion: 'nonEmpty',
              },
            ],
          }
        : scenario,
    ),
    traceability: workflowSpec.traceability.map((entry) =>
      entry.requirementId === 'req-ask'
        ? { ...entry, sectionIds: ['reply'] }
        : entry,
    ),
  });
}

/** Gate 0 模型输出的草稿（结构化输出的 data）；带默认值的字段可省略 */
function createAppSpecDraftFixture(): z.input<
  typeof GeneratedAppSpecDraftSchema
> {
  return {
    appName: '文档问答',
    summary: '输入问题，调用文档问答工作流返回答案与引用。',
    userGoal: '终端用户提问并得到带引用的答案',
    actors: ['终端用户'],
    requirements: [
      {
        id: 'req-ask',
        text: '输入问题后返回答案与引用',
        source: 'prompt',
      },
    ],
    inputForm: {
      title: '提问',
      submitLabel: '提问',
      fields: [
        { id: 'question', label: '问题', type: 'textarea', required: true },
      ],
    },
    resultView: {
      title: '回答',
      sections: [
        { id: 'answer', label: '答案', format: 'markdown' },
        { id: 'citations', label: '引用', format: 'citations' },
      ],
    },
    binding: {
      kind: 'workflow',
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      inputMapping: [{ fieldId: 'question', workflowInputFieldId: 'question' }],
      outputMapping: [
        { sectionId: 'answer', nodeId: 'out-answer' },
        { sectionId: 'citations', nodeId: 'out-structured', path: 'citations' },
      ],
    },
    acceptanceScenarios: [
      {
        id: 'scenario-ask',
        title: '提问后看到答案与引用',
        scope: 'requirement',
        requirementIds: ['req-ask'],
        given: ['公开页已打开'],
        when: ['输入问题并提交'],
        then: ['展示答案', '展示引用'],
        browserSteps: [
          {
            action: 'fill',
            fieldId: 'question',
            value: '最多可以同时运行几个子 Agent？',
          },
          { action: 'submit' },
          {
            action: 'expectResult',
            sectionId: 'answer',
            assertion: 'nonEmpty',
          },
          {
            action: 'expectResult',
            sectionId: 'citations',
            assertion: 'nonEmpty',
          },
        ],
      },
    ],
  };
}

/** 草稿经 `buildAppSpecV2FromDraft` 补全并固定到 WORKFLOW_VERSION_ID 的完整规格（Gate 0 的产出形状） */
function createAppSpecV2FromDraftFixture(): GeneratedAppSpecV2 {
  const draft = GeneratedAppSpecDraftSchema.parse(createAppSpecDraftFixture());
  if (draft.binding.kind !== 'workflow') {
    throw new Error('草稿 fixture 绑定的是工作流');
  }
  return buildAppSpecV2FromDraft(draft, {
    binding: { ...draft.binding, workflowVersionId: WORKFLOW_VERSION_ID },
    modelConfigId: V2_MODEL_CONFIG_ID,
    attempt: 1,
    prompt: V2_PROMPT,
    generatedAt: new Date('2026-10-20T00:00:00.000Z'),
  });
}

/** 已发布的文档问答工作流候选：必填 text 输入 question；text-output 答案 + json-output 结构化结果 */
function createWorkflowBindingCandidateFixture(
  overrides: Partial<WorkflowBindingCandidate> = {},
): WorkflowBindingCandidate {
  return {
    kind: 'workflow',
    workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    workflowVersionId: WORKFLOW_VERSION_ID,
    name: '宣传册文档问答',
    description: '在产品文档知识库中检索并回答问题，给出引用',
    inputSchema: {
      version: 2,
      collectionMode: 'form',
      fields: [
        {
          id: 'question',
          type: 'text',
          label: '问题',
          required: true,
          validation: { maxLength: 2000 },
        },
      ],
    },
    outputNodes: [
      { nodeId: 'out-answer', nodeType: 'text-output', label: '答案' },
      {
        nodeId: 'out-structured',
        nodeType: 'json-output',
        label: '结构化答案',
      },
    ],
    ...overrides,
  };
}

function createAgentBindingCandidateFixture(): AgentBindingCandidate {
  return {
    kind: 'agent',
    agentDefinitionId: V2_AGENT_DEFINITION_ID,
    agentVersionId: V2_AGENT_VERSION_ID,
    name: '宣传册助手',
    description: null,
  };
}

function createResolvedBindingFixture(
  appSpec: GeneratedAppSpecV2 = createAppSpecV2Fixture(),
): ResolvedGeneratedAppBinding {
  if (appSpec.binding.kind === 'agent') {
    return {
      kind: 'agent',
      binding: appSpec.binding,
      candidate: {
        ...createAgentBindingCandidateFixture(),
        agentDefinitionId: appSpec.binding.agentDefinitionId,
        agentVersionId: appSpec.binding.agentVersionId,
      },
    };
  }

  return {
    kind: 'workflow',
    binding: appSpec.binding,
    candidate: createWorkflowBindingCandidateFixture({
      workflowDefinitionId: appSpec.binding.workflowDefinitionId,
      workflowVersionId: appSpec.binding.workflowVersionId,
    }),
  };
}

/** 持有 v2 AppSpec 的应用记录（Gate 0 已产出规格、等待 Gate 1–7）；覆盖项可换成 null 规格等状态 */
function createGeneratedApp(
  overrides: Partial<GeneratedApp> = {},
): GeneratedApp {
  return {
    id: APP_ID,
    tenantId: TENANT_ID,
    prompt: V2_PROMPT,
    appName: '文档问答',
    description: '输入问题，调用文档问答工作流返回答案与引用。',
    status: 'app_spec_ready',
    appSpec: createAppSpecV2Fixture(),
    generationModelConfigId: V2_MODEL_CONFIG_ID,
    bindingTarget: {
      kind: 'workflow',
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
    },
    acceptanceTokenHash: null,
    acceptanceTokenExpiresAt: null,
    acceptanceGenerationRunId: null,
    generationPlan: null,
    gateResults: createInitialGeneratedAppGateResults(NOW.toISOString()),
    readiness: createReadiness(),
    preview: {
      previewUrl: null,
      sourceArtifactUrl: null,
      testReportUrl: null,
    },
    agentDefinitionId: null,
    workflowDefinitionId: null,
    pluginIds: [],
    publicShareToken: null,
    publicShareEnabled: false,
    publicShareCreatedAt: null,
    publicShareDisabledAt: null,
    publicViewCount: 0,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export {
  TENANT_ID,
  USER_ID,
  APP_ID,
  SUBMISSION_ID,
  GENERATION_RUN_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_EXECUTION_ID,
  WORKFLOW_VERSION_ID,
  GATE_RUN_ID,
  REPAIR_ATTEMPT_ID,
  V2_MODEL_CONFIG_ID,
  V2_AGENT_DEFINITION_ID,
  V2_AGENT_VERSION_ID,
  V2_PROMPT,
  NOW,
  DEFAULT_START_GENERATION_RUN_DTO,
  mockTenantDb,
  createConfigService,
  createSelectChain,
  createSelectManyChain,
  createSelectPageChain,
  createSelectLatestRunNumberChain,
  createCountChain,
  createInsertReturningChain,
  createUpdateReturningChain,
  createGeneratedAppUpdateReturningFromPayload,
  createUpdateChain,
  createStorageServiceMock,
  createRepositoryForTest,
  createRuntimeBindingServiceForTest,
  createRepairServiceForTest,
  createPublicRuntimeServiceForTest,
  createReadiness,
  createPublishCandidateReadiness,
  createGeneratedAppSubmission,
  createGeneratedAppGateRun,
  createGeneratedAppGenerationRun,
  createGeneratedAppRepairAttempt,
  createWorkflowDefinitionReadinessRow,
  createAppSpecV2Fixture,
  createAgentAppSpecV2Fixture,
  createAppSpecDraftFixture,
  createAppSpecV2FromDraftFixture,
  createWorkflowBindingCandidateFixture,
  createAgentBindingCandidateFixture,
  createResolvedBindingFixture,
  createGeneratedApp,
};
