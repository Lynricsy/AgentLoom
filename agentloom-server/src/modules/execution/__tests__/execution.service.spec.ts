import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ExecutionService } from '../execution.service';
import { EventBridgeService } from '../services/event-bridge.service';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { SYSTEM_TRIGGER_USER_ID } from '../../trigger/trigger.constants';
import {
  DeadLetterJobNotFoundException,
  ExecutionNotFoundException,
  WorkflowNotPublishedException,
  ExecutionNotCancellableException,
  WorkflowLaunchInputValidationException,
  WorkflowLaunchSchemaVersionMismatchException,
  WorkflowArchivedException,
} from '../execution.exceptions';
import { EXECUTION_QUEUE, AGENT_TASK_QUEUE } from '../execution.constants';
import { DRIZZLE } from '../../../database/database.module';
import { workflowInputSchemaSchema } from '../../workflow/dto/workflow-input-schema.dto';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const USER_ID = '019391d4-b000-7000-0000-000000000002';
const WORKFLOW_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';
const VERSION_ID = '019391d4-e000-7000-0000-000000000005';

const NOW = new Date('2025-01-01T00:00:00Z');

const mockSnapshot = {
  nodes: [
    {
      id: 'node-1',
      type: 'trigger',
      data: { label: 'Start' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'node-2',
      type: 'action',
      data: { label: 'Process' },
      position: { x: 100, y: 0 },
    },
  ],
  edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
  viewport: { x: 0, y: 0, zoom: 1 },
  metadata: { nodeCount: 2, edgeCount: 1, createdFromVersion: 1 },
};

const CONDITIONAL_RUN_INPUT_SCHEMA = {
  version: 2,
  collectionMode: 'form' as const,
  fields: [
    {
      id: 'topic',
      type: 'text' as const,
      label: '分析主题',
      required: true,
      validation: { maxLength: 200 },
    },
    {
      id: 'mode',
      type: 'single_select' as const,
      label: '运行模式',
      required: true,
      options: ['basic', 'advanced'],
      default: 'basic',
    },
    {
      id: 'locale',
      type: 'text' as const,
      label: '语言',
      required: false,
      default: 'zh-CN',
    },
    {
      id: 'advancedNote',
      type: 'text' as const,
      label: '高级说明',
      required: false,
      visibility: {
        fieldId: 'mode',
        equals: 'advanced',
      },
    },
  ],
};

const CONVERSATION_RUN_INPUT_SCHEMA = {
  version: 3,
  collectionMode: 'conversation' as const,
  conversationPlan: {
    systemPrompt: '你是一个对话式参数收集助手',
    maxTurns: 5,
  },
  fields: [
    {
      id: 'topic',
      type: 'text' as const,
      label: '分析主题',
      required: true,
      collectionHint: '先确认用户最关注的主题',
    },
    {
      id: 'depth',
      type: 'single_select' as const,
      label: '分析深度',
      required: false,
      options: ['brief', 'deep'],
      default: 'brief',
      collectionHint: '若用户没有明确说明，可保持 brief',
    },
    {
      id: 'followUp',
      type: 'text' as const,
      label: '补充说明',
      required: false,
      collectionHint: '仅在深度分析时继续追问',
      visibility: {
        fieldId: 'depth',
        equals: 'deep',
      },
    },
  ],
};

const HYBRID_RUN_INPUT_SCHEMA = {
  version: 4,
  collectionMode: 'hybrid' as const,
  conversationPlan: {
    systemPrompt: '你先用对话补齐关键信息，再回到结构化确认',
    maxTurns: 6,
  },
  fields: [
    {
      id: 'topic',
      type: 'text' as const,
      label: '主题',
      required: true,
      collectionHint: '先问用户本次需要分析什么',
    },
    {
      id: 'mode',
      type: 'single_select' as const,
      label: '模式',
      required: true,
      options: ['quick', 'deep'],
      default: 'quick',
      collectionHint: '没有明确要求时使用 quick',
    },
    {
      id: 'brief',
      type: 'text' as const,
      label: '摘要要求',
      required: false,
      default: '输出 3 条关键结论',
      collectionHint: '可在确认阶段展示默认摘要要求',
    },
    {
      id: 'deepNote',
      type: 'text' as const,
      label: '深度备注',
      required: false,
      collectionHint: '仅在 deep 模式时继续补齐',
      visibility: {
        fieldId: 'mode',
        equals: 'deep',
      },
    },
  ],
};

const FORM_ONLY_BACKWARD_COMPAT_SCHEMA = {
  version: 1,
  collectionMode: 'form' as const,
  fields: [
    {
      id: 'topic',
      type: 'text' as const,
      label: '主题',
      required: true,
    },
  ],
};

const mockPublishedWorkflow = {
  id: WORKFLOW_ID,
  tenantId: TENANT_ID,
  status: 'published' as const,
  publishedVersionId: VERSION_ID,
  name: 'Test Workflow',
  createdBy: USER_ID,
};

const mockVersion = {
  id: VERSION_ID,
  snapshot: mockSnapshot,
};

const mockExecution = {
  id: EXECUTION_ID,
  workflowDefinitionId: WORKFLOW_ID,
  workflowVersionId: VERSION_ID,
  tenantId: TENANT_ID,
  status: 'pending' as const,
  triggerType: 'manual' as const,
  inputParams: {},
  definitionSnapshot: mockSnapshot,
  totalSteps: 0,
  completedSteps: 0,
  createdBy: USER_ID,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  cancelledAt: null,
  errorMessage: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function createVersionWithInputSchema(inputSchema: unknown) {
  return {
    ...mockVersion,
    snapshot: {
      ...mockSnapshot,
      inputSchema,
    },
  };
}

function createExecutionWithInputParams(
  inputParams: Record<string, unknown>,
  definitionSnapshot = mockSnapshot,
) {
  return {
    ...mockExecution,
    inputParams,
    definitionSnapshot,
  };
}

const txDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
};

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectChainWithOrderBy(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createSelectChainPaginated(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

function createInsertChainReturning(result: unknown) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createInsertChainVoid() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

function createUpdateChainReturning(result: unknown) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createUpdateChainVoid() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

const db = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(async (callback: (tx: typeof txDb) => Promise<unknown>) =>
    callback(txDb),
  ),
};

const mockQueue: Record<string, Mock> = {
  add: vi.fn(),
  getJobs: vi.fn(),
  getJob: vi.fn(),
};

const mockEventBridge: Record<string, Mock> = {
  emitExecutionStatusChanged: vi.fn(),
};

const mockAgentTaskQueue: Record<string, Mock> = {
  getFailed: vi.fn(),
  getJobCounts: vi.fn(),
  getJob: vi.fn(),
};

describe('ExecutionService', () => {
  let service: ExecutionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    db.select.mockReset();
    db.insert.mockReset();
    db.update.mockReset();
    db.delete.mockReset();
    db.execute.mockReset();
    db.transaction.mockReset();
    txDb.select.mockReset();
    txDb.insert.mockReset();
    txDb.update.mockReset();
    txDb.delete.mockReset();
    txDb.execute.mockReset();
    mockQueue.add.mockReset();
    mockQueue.getJobs.mockReset();
    mockQueue.getJob.mockReset();
    mockEventBridge.emitExecutionStatusChanged.mockReset();
    mockAgentTaskQueue.getFailed.mockReset();
    mockAgentTaskQueue.getJobCounts.mockReset();
    mockAgentTaskQueue.getJob.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    txDb.execute.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: DRIZZLE, useValue: db },
        { provide: getQueueToken(EXECUTION_QUEUE), useValue: mockQueue },
        {
          provide: getQueueToken(AGENT_TASK_QUEUE),
          useValue: mockAgentTaskQueue,
        },
        { provide: EventBridgeService, useValue: mockEventBridge },
      ],
    }).compile();

    service = module.get(ExecutionService);
  });

  describe('runWorkflow', () => {
    it('应为已发布的工作流创建执行并添加队列任务', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([mockPublishedWorkflow]))
        .mockReturnValueOnce(createSelectChain([mockVersion]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([mockExecution]),
      );
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.runWorkflow(
        WORKFLOW_ID,
        { inputParams: { source: 'manual-trigger' } },
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual(mockExecution);
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute',
        {
          executionId: EXECUTION_ID,
          tenantId: TENANT_ID,
        },
        {
          jobId: EXECUTION_ID,
        },
      );
    });

    it('应将 launchSource 合并到 inputParams._meta 中', async () => {
      const executionWithLaunchSource = {
        ...mockExecution,
        inputParams: {
          topic: 'AI 趋势',
          _meta: { launchSource: 'mobile' },
        },
      };

      db.select
        .mockReturnValueOnce(createSelectChain([mockPublishedWorkflow]))
        .mockReturnValueOnce(createSelectChain([mockVersion]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([executionWithLaunchSource]),
      );
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.runWorkflow(
        WORKFLOW_ID,
        {
          inputParams: { topic: 'AI 趋势' },
          launchSource: 'mobile',
        },
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual(executionWithLaunchSource);

      const insertValues =
        db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.inputParams).toEqual({
        topic: 'AI 趋势',
        _meta: { launchSource: 'mobile' },
      });
    });

    it('应根据已发布 inputSchema 注入默认值、清理隐藏字段并写入 launchConfig', async () => {
      const workflowWithInputSchema = {
        ...mockPublishedWorkflow,
        inputSchema: CONDITIONAL_RUN_INPUT_SCHEMA,
      };
      const versionWithInputSchema = {
        ...mockVersion,
        snapshot: {
          ...mockSnapshot,
          inputSchema: CONDITIONAL_RUN_INPUT_SCHEMA,
        },
      };
      const normalizedInputParams = {
        topic: 'AI 趋势',
        mode: 'basic',
        locale: 'zh-CN',
        _meta: {
          launchSource: 'mobile',
          launchConfig: {
            workflowId: WORKFLOW_ID,
            schemaVersion: 2,
            collectionMode: 'form',
            resolvedInputs: {
              topic: 'AI 趋势',
              mode: 'basic',
              locale: 'zh-CN',
            },
            unresolvedFieldIds: ['advancedNote'],
            launchSource: 'mobile',
          },
        },
      };
      const executionWithNormalizedLaunch = {
        ...mockExecution,
        inputParams: normalizedInputParams,
        definitionSnapshot: versionWithInputSchema.snapshot,
      };

      db.select
        .mockReturnValueOnce(createSelectChain([workflowWithInputSchema]))
        .mockReturnValueOnce(createSelectChain([versionWithInputSchema]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([executionWithNormalizedLaunch]),
      );
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.runWorkflow(
        WORKFLOW_ID,
        {
          schemaVersion: 2,
          inputParams: {
            topic: 'AI 趋势',
            advancedNote: '这条隐藏字段应被清理',
          },
          launchSource: 'mobile',
        },
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual(executionWithNormalizedLaunch);

      const insertValues =
        db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.inputParams).toEqual(normalizedInputParams);
    });

    it('应在 schemaVersion 与已发布 inputSchema.version 不匹配时抛出 409', async () => {
      const workflowWithInputSchema = {
        ...mockPublishedWorkflow,
        inputSchema: CONDITIONAL_RUN_INPUT_SCHEMA,
      };

      db.select.mockReturnValueOnce(createSelectChain([workflowWithInputSchema]));

      await expect(
        service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 1,
            inputParams: { topic: 'AI 趋势' },
            launchSource: 'mobile',
          },
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toThrow(WorkflowLaunchSchemaVersionMismatchException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('应在缺少可见必填字段时抛出 422', async () => {
      const workflowWithInputSchema = {
        ...mockPublishedWorkflow,
        inputSchema: CONDITIONAL_RUN_INPUT_SCHEMA,
      };

      db.select.mockReturnValueOnce(createSelectChain([workflowWithInputSchema]));

      try {
        await service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 2,
            inputParams: {},
            launchSource: 'mobile',
          },
          TENANT_ID,
          USER_ID,
        );

        throw new Error('应当抛出 WorkflowLaunchInputValidationException');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowLaunchInputValidationException);
        expect((error as WorkflowLaunchInputValidationException).errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'inputParams.topic',
            }),
          ]),
        );
      }

      expect(db.insert).not.toHaveBeenCalled();
    });

    describe('conversation/hybrid schema contract', () => {
      it('应在 conversation 模式下保留 conversationPlan 与 collectionHint 并生成 launchConfig', async () => {
        expect(
          workflowInputSchemaSchema.parse(CONVERSATION_RUN_INPUT_SCHEMA),
        ).toMatchObject({
          collectionMode: 'conversation',
          conversationPlan: CONVERSATION_RUN_INPUT_SCHEMA.conversationPlan,
          fields: expect.arrayContaining([
            expect.objectContaining({
              id: 'topic',
              collectionHint: '先确认用户最关注的主题',
            }),
          ]),
        });

        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: CONVERSATION_RUN_INPUT_SCHEMA,
        };
        const versionWithInputSchema = createVersionWithInputSchema(
          CONVERSATION_RUN_INPUT_SCHEMA,
        );
        const normalizedInputParams = {
          topic: '企业级 AI 采用',
          depth: 'brief',
          _meta: {
            launchSource: 'web-studio',
            launchConfig: {
              workflowId: WORKFLOW_ID,
              schemaVersion: 3,
              collectionMode: 'conversation',
              resolvedInputs: {
                topic: '企业级 AI 采用',
                depth: 'brief',
              },
              unresolvedFieldIds: ['followUp'],
              launchSource: 'web-studio',
            },
          },
        };
        const executionWithNormalizedLaunch = createExecutionWithInputParams(
          normalizedInputParams,
          versionWithInputSchema.snapshot,
        );

        db.select
          .mockReturnValueOnce(createSelectChain([workflowWithInputSchema]))
          .mockReturnValueOnce(createSelectChain([versionWithInputSchema]));
        db.insert.mockReturnValueOnce(
          createInsertChainReturning([executionWithNormalizedLaunch]),
        );
        mockQueue.add.mockResolvedValue(undefined);

        const result = await service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 3,
            inputParams: {
              topic: '企业级 AI 采用',
            },
            launchSource: 'web-studio',
          },
          TENANT_ID,
          USER_ID,
        );

        expect(result).toEqual(executionWithNormalizedLaunch);

        const insertValues =
          db.insert.mock.results[0].value.values.mock.calls[0][0];
        expect(insertValues.inputParams).toEqual(normalizedInputParams);
      });

      it('应在 hybrid 模式下保留 conversationPlan 并生成 launchConfig', async () => {
        expect(workflowInputSchemaSchema.parse(HYBRID_RUN_INPUT_SCHEMA)).toMatchObject(
          {
            collectionMode: 'hybrid',
            conversationPlan: HYBRID_RUN_INPUT_SCHEMA.conversationPlan,
            fields: expect.arrayContaining([
              expect.objectContaining({
                id: 'topic',
                collectionHint: '先问用户本次需要分析什么',
              }),
            ]),
          },
        );

        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: HYBRID_RUN_INPUT_SCHEMA,
        };
        const versionWithInputSchema = createVersionWithInputSchema(
          HYBRID_RUN_INPUT_SCHEMA,
        );
        const normalizedInputParams = {
          topic: '自动化客服',
          mode: 'quick',
          brief: '输出 3 条关键结论',
          _meta: {
            launchSource: 'web-studio',
            launchConfig: {
              workflowId: WORKFLOW_ID,
              schemaVersion: 4,
              collectionMode: 'hybrid',
              resolvedInputs: {
                topic: '自动化客服',
                mode: 'quick',
                brief: '输出 3 条关键结论',
              },
              unresolvedFieldIds: ['deepNote'],
              launchSource: 'web-studio',
            },
          },
        };
        const executionWithNormalizedLaunch = createExecutionWithInputParams(
          normalizedInputParams,
          versionWithInputSchema.snapshot,
        );

        db.select
          .mockReturnValueOnce(createSelectChain([workflowWithInputSchema]))
          .mockReturnValueOnce(createSelectChain([versionWithInputSchema]));
        db.insert.mockReturnValueOnce(
          createInsertChainReturning([executionWithNormalizedLaunch]),
        );
        mockQueue.add.mockResolvedValue(undefined);

        const result = await service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 4,
            inputParams: {
              topic: '自动化客服',
            },
            launchSource: 'web-studio',
          },
          TENANT_ID,
          USER_ID,
        );

        expect(result).toEqual(executionWithNormalizedLaunch);

        const insertValues =
          db.insert.mock.results[0].value.values.mock.calls[0][0];
        expect(insertValues.inputParams).toEqual(normalizedInputParams);
      });

      it('应兼容不带 conversationPlan 的 form schema', async () => {
        expect(
          workflowInputSchemaSchema.parse(FORM_ONLY_BACKWARD_COMPAT_SCHEMA),
        ).toMatchObject({
          collectionMode: 'form',
          fields: [
            expect.objectContaining({
              id: 'topic',
            }),
          ],
        });

        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: FORM_ONLY_BACKWARD_COMPAT_SCHEMA,
        };
        const versionWithInputSchema = createVersionWithInputSchema(
          FORM_ONLY_BACKWARD_COMPAT_SCHEMA,
        );
        const normalizedInputParams = {
          topic: '老 schema 兼容性',
          _meta: {
            launchSource: 'web-studio',
            launchConfig: {
              workflowId: WORKFLOW_ID,
              schemaVersion: 1,
              collectionMode: 'form',
              resolvedInputs: {
                topic: '老 schema 兼容性',
              },
              unresolvedFieldIds: [],
              launchSource: 'web-studio',
            },
          },
        };
        const executionWithNormalizedLaunch = createExecutionWithInputParams(
          normalizedInputParams,
          versionWithInputSchema.snapshot,
        );

        db.select
          .mockReturnValueOnce(createSelectChain([workflowWithInputSchema]))
          .mockReturnValueOnce(createSelectChain([versionWithInputSchema]));
        db.insert.mockReturnValueOnce(
          createInsertChainReturning([executionWithNormalizedLaunch]),
        );
        mockQueue.add.mockResolvedValue(undefined);

        const result = await service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 1,
            inputParams: {
              topic: '老 schema 兼容性',
            },
            launchSource: 'web-studio',
          },
          TENANT_ID,
          USER_ID,
        );

        expect(result).toEqual(executionWithNormalizedLaunch);

        const insertValues =
          db.insert.mock.results[0].value.values.mock.calls[0][0];
        expect(insertValues.inputParams).toEqual(normalizedInputParams);
      });
    });

    describe('conversation/hybrid launch normalization', () => {
      it('应为 conversation 模式生成包含 resolved 与 unresolved 字段的 canonical launchConfig', async () => {
        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: CONVERSATION_RUN_INPUT_SCHEMA,
        };
        const versionWithInputSchema = createVersionWithInputSchema(
          CONVERSATION_RUN_INPUT_SCHEMA,
        );
        const normalizedInputParams = {
          topic: '行业研究',
          depth: 'brief',
          _meta: {
            launchSource: 'web-studio',
            launchConfig: {
              workflowId: WORKFLOW_ID,
              schemaVersion: 3,
              collectionMode: 'conversation',
              resolvedInputs: {
                topic: '行业研究',
                depth: 'brief',
              },
              unresolvedFieldIds: ['followUp'],
              launchSource: 'web-studio',
            },
          },
        };

        db.select
          .mockReturnValueOnce(createSelectChain([workflowWithInputSchema]))
          .mockReturnValueOnce(createSelectChain([versionWithInputSchema]));
        db.insert.mockReturnValueOnce(
          createInsertChainReturning([
            createExecutionWithInputParams(
              normalizedInputParams,
              versionWithInputSchema.snapshot,
            ),
          ]),
        );
        mockQueue.add.mockResolvedValue(undefined);

        await service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 3,
            inputParams: {
              topic: '行业研究',
            },
            launchSource: 'web-studio',
          },
          TENANT_ID,
          USER_ID,
        );

        const insertValues =
          db.insert.mock.results[0].value.values.mock.calls[0][0];
        expect(insertValues.inputParams).toEqual(normalizedInputParams);
      });

      it('应在 hybrid 模式下基于可见性规则排除隐藏字段并生成 canonical launchConfig', async () => {
        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: HYBRID_RUN_INPUT_SCHEMA,
        };
        const versionWithInputSchema = createVersionWithInputSchema(
          HYBRID_RUN_INPUT_SCHEMA,
        );
        const normalizedInputParams = {
          topic: '客服自动化',
          mode: 'quick',
          brief: '输出 3 条关键结论',
          _meta: {
            launchSource: 'web-studio',
            launchConfig: {
              workflowId: WORKFLOW_ID,
              schemaVersion: 4,
              collectionMode: 'hybrid',
              resolvedInputs: {
                topic: '客服自动化',
                mode: 'quick',
                brief: '输出 3 条关键结论',
              },
              unresolvedFieldIds: ['deepNote'],
              launchSource: 'web-studio',
            },
          },
        };

        db.select
          .mockReturnValueOnce(createSelectChain([workflowWithInputSchema]))
          .mockReturnValueOnce(createSelectChain([versionWithInputSchema]));
        db.insert.mockReturnValueOnce(
          createInsertChainReturning([
            createExecutionWithInputParams(
              normalizedInputParams,
              versionWithInputSchema.snapshot,
            ),
          ]),
        );
        mockQueue.add.mockResolvedValue(undefined);

        await service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 4,
            inputParams: {
              topic: '客服自动化',
            },
            launchSource: 'web-studio',
          },
          TENANT_ID,
          USER_ID,
        );

        const insertValues =
          db.insert.mock.results[0].value.values.mock.calls[0][0];
        expect(insertValues.inputParams).toEqual(normalizedInputParams);
      });

      it('应在 conversation 模式的手动启动中校验 schemaVersion', async () => {
        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: CONVERSATION_RUN_INPUT_SCHEMA,
        };

        db.select.mockReturnValueOnce(createSelectChain([workflowWithInputSchema]));

        await expect(
          service.runWorkflow(
            WORKFLOW_ID,
            {
              schemaVersion: 999,
              inputParams: { topic: 'AI 趋势' },
              launchSource: 'web-studio',
            },
            TENANT_ID,
            USER_ID,
          ),
        ).rejects.toThrow(WorkflowLaunchSchemaVersionMismatchException);

        expect(db.insert).not.toHaveBeenCalled();
      });

      it('应在 conversation 模式缺少必填字段时抛出 422', async () => {
        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: CONVERSATION_RUN_INPUT_SCHEMA,
        };

        db.select.mockReturnValueOnce(createSelectChain([workflowWithInputSchema]));

        try {
          await service.runWorkflow(
            WORKFLOW_ID,
            {
              schemaVersion: 3,
              inputParams: {},
              launchSource: 'web-studio',
            },
            TENANT_ID,
            USER_ID,
          );

          throw new Error('应当抛出 WorkflowLaunchInputValidationException');
        } catch (error) {
          expect(error).toBeInstanceOf(WorkflowLaunchInputValidationException);
          expect((error as WorkflowLaunchInputValidationException).errors).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                field: 'inputParams.topic',
              }),
            ]),
          );
        }

        expect(db.insert).not.toHaveBeenCalled();
      });

      it('应在 hybrid 模式下为字段注入默认值', async () => {
        const workflowWithInputSchema = {
          ...mockPublishedWorkflow,
          inputSchema: HYBRID_RUN_INPUT_SCHEMA,
        };
        const versionWithInputSchema = createVersionWithInputSchema(
          HYBRID_RUN_INPUT_SCHEMA,
        );
        const normalizedInputParams = {
          topic: '企业知识库',
          mode: 'quick',
          brief: '输出 3 条关键结论',
          _meta: {
            launchSource: 'web-studio',
            launchConfig: {
              workflowId: WORKFLOW_ID,
              schemaVersion: 4,
              collectionMode: 'hybrid',
              resolvedInputs: {
                topic: '企业知识库',
                mode: 'quick',
                brief: '输出 3 条关键结论',
              },
              unresolvedFieldIds: ['deepNote'],
              launchSource: 'web-studio',
            },
          },
        };

        db.select
          .mockReturnValueOnce(createSelectChain([workflowWithInputSchema]))
          .mockReturnValueOnce(createSelectChain([versionWithInputSchema]));
        db.insert.mockReturnValueOnce(
          createInsertChainReturning([
            createExecutionWithInputParams(
              normalizedInputParams,
              versionWithInputSchema.snapshot,
            ),
          ]),
        );
        mockQueue.add.mockResolvedValue(undefined);

        await service.runWorkflow(
          WORKFLOW_ID,
          {
            schemaVersion: 4,
            inputParams: {
              topic: '企业知识库',
            },
            launchSource: 'web-studio',
          },
          TENANT_ID,
          USER_ID,
        );

        const insertValues =
          db.insert.mock.results[0].value.values.mock.calls[0][0];
        expect(insertValues.inputParams).toEqual(normalizedInputParams);
      });
    });

    it('应允许内部触发请求覆盖 triggerType 并写入内部 launchSource', async () => {
      const executionFromWebhook = {
        ...mockExecution,
        triggerType: 'webhook' as const,
        inputParams: {
          hello: 'world',
          _meta: { launchSource: 'webhook-trigger' },
        },
      };

      db.select
        .mockReturnValueOnce(createSelectChain([mockPublishedWorkflow]))
        .mockReturnValueOnce(createSelectChain([mockVersion]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([executionFromWebhook]),
      );
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.runWorkflow(
        WORKFLOW_ID,
        {
          inputParams: { hello: 'world' },
          launchSource: 'webhook-trigger',
          triggerType: 'webhook',
        },
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual(executionFromWebhook);

      const insertValues =
        db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.triggerType).toBe('webhook');
      expect(insertValues.inputParams).toEqual({
        hello: 'world',
        _meta: { launchSource: 'webhook-trigger' },
      });
    });

    it('应在系统触发场景回退 execution.createdBy 到 workflow.createdBy', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([mockPublishedWorkflow]))
        .mockReturnValueOnce(createSelectChain([mockVersion]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([
          {
            ...mockExecution,
            triggerType: 'system' as const,
            createdBy: USER_ID,
          },
        ]),
      );
      mockQueue.add.mockResolvedValue(undefined);

      await service.runWorkflow(
        WORKFLOW_ID,
        {
          launchSource: 'cron-trigger',
          triggerType: 'system',
        },
        TENANT_ID,
        SYSTEM_TRIGGER_USER_ID,
      );

      const insertValues =
        db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.createdBy).toBe(USER_ID);
      expect(insertValues.triggerType).toBe('system');
      expect(insertValues.inputParams).toEqual({
        _meta: { launchSource: 'cron-trigger' },
      });
    });

    it('应在租户事务中延后到提交后再入队 execution job', async () => {
      txDb.select
        .mockReturnValueOnce(createSelectChain([mockPublishedWorkflow]))
        .mockReturnValueOnce(createSelectChain([mockVersion]));
      txDb.insert.mockReturnValueOnce(
        createInsertChainReturning([mockExecution]),
      );
      mockQueue.add.mockResolvedValue(undefined);

      await runInTenantTransaction(db as never, TENANT_ID, async () => {
        await service.runWorkflow(
          WORKFLOW_ID,
          { inputParams: { source: 'cron' } },
          TENANT_ID,
          USER_ID,
        );

        expect(mockQueue.add).not.toHaveBeenCalled();
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute',
        {
          executionId: EXECUTION_ID,
          tenantId: TENANT_ID,
        },
        {
          jobId: EXECUTION_ID,
        },
      );
    });

    it('应在入队失败时将 execution 标记为 failed 并广播状态变化', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([mockPublishedWorkflow]))
        .mockReturnValueOnce(createSelectChain([mockVersion]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([mockExecution]),
      );
      db.update.mockReturnValueOnce(createUpdateChainVoid());
      mockQueue.add.mockRejectedValueOnce(new Error('queue unavailable'));

      await expect(
        service.runWorkflow(WORKFLOW_ID, undefined, TENANT_ID, USER_ID),
      ).rejects.toThrow('queue unavailable');

      expect(db.update).toHaveBeenCalledTimes(1);
      const setValues = db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setValues.status).toBe('failed');
      expect(setValues.failedAt).toBeInstanceOf(Date);
      expect(setValues.errorMessage).toEqual({
        message: 'queue unavailable',
      });
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          executionId: EXECUTION_ID,
          status: 'failed',
          errorMessage: 'queue unavailable',
        },
      );
    });

    it('应拒绝草稿工作流 (WorkflowNotPublishedException)', async () => {
      const draftWorkflow = {
        ...mockPublishedWorkflow,
        status: 'draft',
        publishedVersionId: null,
      };
      db.select.mockReturnValueOnce(createSelectChain([draftWorkflow]));

      await expect(
        service.runWorkflow(WORKFLOW_ID, undefined, TENANT_ID, USER_ID),
      ).rejects.toThrow(WorkflowNotPublishedException);
    });

    it('应拒绝已归档的工作流', async () => {
      const archivedWorkflow = {
        ...mockPublishedWorkflow,
        status: 'archived',
        publishedVersionId: null,
      };
      db.select.mockReturnValueOnce(createSelectChain([archivedWorkflow]));

      await expect(
        service.runWorkflow(WORKFLOW_ID, undefined, TENANT_ID, USER_ID),
      ).rejects.toThrow(WorkflowArchivedException);
    });

    it('应在工作流不存在时抛出异常', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.runWorkflow(WORKFLOW_ID, undefined, TENANT_ID, USER_ID),
      ).rejects.toThrow(WorkflowNotPublishedException);
    });
  });

  describe('getExecution', () => {
    it('应返回执行详情和步骤列表', async () => {
      const mockSteps = [
        {
          id: 'step-1',
          executionId: EXECUTION_ID,
          nodeId: 'node-1',
          stepOrder: 0,
          status: 'pending',
        },
        {
          id: 'step-2',
          executionId: EXECUTION_ID,
          nodeId: 'node-2',
          stepOrder: 1,
          status: 'pending',
        },
      ];
      db.select
        .mockReturnValueOnce(createSelectChain([mockExecution]))
        .mockReturnValueOnce(createSelectChainWithOrderBy(mockSteps));

      const result = await service.getExecution(EXECUTION_ID);

      expect(result).toEqual({ ...mockExecution, steps: mockSteps });
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('应在执行不存在时抛出 ExecutionNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.getExecution(EXECUTION_ID)).rejects.toThrow(
        ExecutionNotFoundException,
      );
    });
  });

  describe('listExecutions', () => {
    it('应返回分页的执行列表', async () => {
      const executions = [mockExecution];
      db.select
        .mockReturnValueOnce(createSelectChainPaginated(executions))
        .mockReturnValueOnce(createSelectChain([{ count: 1 }]));

      const result = await service.listExecutions(WORKFLOW_ID, 1, 20);

      expect(result).toEqual({
        data: executions,
        meta: { total: 1, page: 1, limit: 20, pageSize: 20, totalPages: 1 },
      });
    });

    it('应在没有结果时返回空列表', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainPaginated([]))
        .mockReturnValueOnce(createSelectChain([{ count: 0 }]));

      const result = await service.listExecutions(WORKFLOW_ID, 1, 20);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('应支持通过状态过滤', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainPaginated([]))
        .mockReturnValueOnce(createSelectChain([{ count: 0 }]));

      const result = await service.listExecutions(
        WORKFLOW_ID,
        1,
        20,
        'running',
      );

      expect(result.data).toEqual([]);
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelExecution', () => {
    it('应取消运行中的执行', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
        cancelledAt: NOW,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());
      mockQueue.getJob.mockResolvedValue(null);
      mockQueue.getJobs.mockResolvedValue([]);

      const result = await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(result.status).toBe('cancelled');
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({
          executionId: EXECUTION_ID,
          status: 'cancelled',
        }),
      );
    });

    it('应取消 pending 状态的执行', async () => {
      const pendingExecution = { ...mockExecution, status: 'pending' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([pendingExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());
      mockQueue.getJob.mockResolvedValue(null);
      mockQueue.getJobs.mockResolvedValue([]);

      const result = await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(result.status).toBe('cancelled');
    });

    it('应移除匹配的 BullMQ 任务', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());

      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const matchingJob = {
        remove: mockRemove,
        getState: vi.fn().mockResolvedValue('waiting'),
      };
      mockQueue.getJob.mockResolvedValue(matchingJob);

      await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(mockRemove).toHaveBeenCalled();
      expect(mockQueue.getJobs).not.toHaveBeenCalled();
    });

    it('应在 getJob 回退时扫描 prioritized 队列任务', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());

      const mockRemove = vi.fn().mockResolvedValue(undefined);
      mockQueue.getJob.mockResolvedValue(null);
      mockQueue.getJobs.mockResolvedValue([
        {
          data: { executionId: EXECUTION_ID },
          remove: mockRemove,
        },
      ]);

      await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(mockQueue.getJobs).toHaveBeenCalledWith([
        'waiting',
        'delayed',
        'prioritized',
      ]);
      expect(mockRemove).toHaveBeenCalled();
    });

    it('应跳过移除 active 状态的 BullMQ 任务', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());

      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const activeJob = {
        remove: mockRemove,
        getState: vi.fn().mockResolvedValue('active'),
      };
      mockQueue.getJob.mockResolvedValue(activeJob);

      await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('应在执行不存在时抛出 ExecutionNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.cancelExecution(EXECUTION_ID, TENANT_ID),
      ).rejects.toThrow(ExecutionNotFoundException);
    });

    it('应在执行已完成时抛出 ExecutionNotCancellableException', async () => {
      const completedExecution = {
        ...mockExecution,
        status: 'completed' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([completedExecution]));

      await expect(
        service.cancelExecution(EXECUTION_ID, TENANT_ID),
      ).rejects.toThrow(ExecutionNotCancellableException);
    });

    it('应在执行已失败时抛出 ExecutionNotCancellableException', async () => {
      const failedExecution = { ...mockExecution, status: 'failed' as const };
      db.select.mockReturnValueOnce(createSelectChain([failedExecution]));

      await expect(
        service.cancelExecution(EXECUTION_ID, TENANT_ID),
      ).rejects.toThrow(ExecutionNotCancellableException);
    });
  });

  describe('initializeSteps', () => {
    it('应从快照节点创建步骤并将执行准备为 running', async () => {
      db.select.mockReturnValueOnce(createSelectChain([mockExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([mockExecution]))
        .mockReturnValueOnce(createSelectChain([]));
      txDb.update.mockReturnValueOnce(
        createUpdateChainReturning([{ status: 'running' }]),
      );
      txDb.insert.mockReturnValueOnce(createInsertChainVoid());

      await service.initializeSteps(EXECUTION_ID);

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(txDb.execute).toHaveBeenCalledTimes(2);
      expect(txDb.update).toHaveBeenCalledTimes(1);
      expect(txDb.insert).toHaveBeenCalledTimes(1);
      expect(mockEventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
    });

    it('应在没有节点时跳过步骤插入并直接完成 execution', async () => {
      const emptyExecution = {
        ...mockExecution,
        definitionSnapshot: { ...mockSnapshot, nodes: [] },
      };
      db.select.mockReturnValueOnce(createSelectChain([emptyExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([emptyExecution]))
        .mockReturnValueOnce(createSelectChain([]));
      txDb.update.mockReturnValueOnce(
        createUpdateChainReturning([{ status: 'completed' }]),
      );

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.insert).not.toHaveBeenCalled();
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        { executionId: EXECUTION_ID, status: 'completed', totalSteps: 0 },
      );
    });

    it('应在执行已 running 且缺少步骤时补建步骤而不重复切换状态', async () => {
      const runningExecution = {
        ...mockExecution,
        status: 'running' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([runningExecution]))
        .mockReturnValueOnce(createSelectChain([]));
      txDb.insert.mockReturnValueOnce(createInsertChainVoid());

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.update).not.toHaveBeenCalled();
      expect(txDb.insert).toHaveBeenCalledTimes(1);
      expect(mockEventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
    });

    it('应在执行已 running 且已有步骤时保持幂等', async () => {
      const runningExecution = {
        ...mockExecution,
        status: 'running' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([runningExecution]))
        .mockReturnValueOnce(
          createSelectChain([{ executionId: EXECUTION_ID, nodeId: 'node-1' }]),
        );

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.update).not.toHaveBeenCalled();
      expect(txDb.insert).not.toHaveBeenCalled();
      expect(mockEventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
    });

    it('应在执行已取消时跳过步骤初始化', async () => {
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([cancelledExecution]));
      txDb.select.mockReturnValueOnce(createSelectChain([cancelledExecution]));

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.update).not.toHaveBeenCalled();
      expect(txDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('markFailed', () => {
    it('应标记执行为失败并广播事件', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ tenantId: TENANT_ID }]),
      );
      txDb.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: EXECUTION_ID }]),
      );

      const error = new Error('执行失败');
      await service.markFailed(EXECUTION_ID, error);

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(txDb.execute).toHaveBeenCalledTimes(2);
      expect(txDb.update).toHaveBeenCalledTimes(1);
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          executionId: EXECUTION_ID,
          status: 'failed',
          errorMessage: '执行失败',
        },
      );
    });

    it('应在执行已取消时跳过失败覆盖', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ tenantId: TENANT_ID }]),
      );
      txDb.update.mockReturnValueOnce(createUpdateChainReturning([]));
      txDb.select.mockReturnValueOnce(
        createSelectChain([{ status: 'cancelled' }]),
      );

      const error = new Error('执行失败');
      await service.markFailed(EXECUTION_ID, error);

      expect(txDb.update).toHaveBeenCalledTimes(1);
      expect(txDb.select).toHaveBeenCalledTimes(1);
      expect(mockEventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
    });

    it('应在执行不存在时不广播事件', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      const error = new Error('执行失败');
      await service.markFailed(EXECUTION_ID, error);

      expect(db.transaction).not.toHaveBeenCalled();
      expect(mockEventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('Dead Letter Queue', () => {
    it('应仅返回当前租户的失败任务列表', async () => {
      const ownJob = {
        id: 'job-1',
        name: 'agent-task',
        data: {
          executionId: EXECUTION_ID,
          stepId: 'step-1',
          tenantId: TENANT_ID,
        },
        failedReason: 'LLM 调用失败',
        attemptsMade: 4,
        timestamp: 1000,
        finishedOn: 2000,
        processedOn: 1500,
      };
      const foreignJob = {
        id: 'job-2',
        name: 'agent-task',
        data: {
          executionId: 'other-exec',
          stepId: 'step-9',
          tenantId: 'other-tenant',
        },
        failedReason: '其他租户失败',
        attemptsMade: 4,
        timestamp: 1100,
        finishedOn: 2100,
        processedOn: 1600,
      };
      mockAgentTaskQueue.getFailed.mockResolvedValue([ownJob, foreignJob]);
      mockAgentTaskQueue.getJobCounts.mockResolvedValue({ failed: 2 });

      const result = await service.getDeadLetterJobs(TENANT_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        jobId: 'job-1',
        name: 'agent-task',
        data: ownJob.data,
        failedReason: 'LLM 调用失败',
        attemptsMade: 4,
        timestamp: 1000,
        finishedOn: 2000,
        processedOn: 1500,
      });
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(mockAgentTaskQueue.getFailed).toHaveBeenCalledWith(0, 1);
    });

    it('应重试指定的失败任务', async () => {
      const mockJob = {
        id: 'job-1',
        data: { tenantId: TENANT_ID },
        retry: vi.fn(),
      };
      mockAgentTaskQueue.getJob.mockResolvedValue(mockJob);

      await service.retryDeadLetterJob(TENANT_ID, 'job-1');

      expect(mockAgentTaskQueue.getJob).toHaveBeenCalledWith('job-1');
      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('应在重试不存在或越权任务时抛出异常', async () => {
      mockAgentTaskQueue.getJob.mockResolvedValue({
        id: 'job-foreign',
        data: { tenantId: 'other-tenant' },
        retry: vi.fn(),
      });

      await expect(
        service.retryDeadLetterJob(TENANT_ID, 'nonexistent'),
      ).rejects.toBeInstanceOf(DeadLetterJobNotFoundException);

      mockAgentTaskQueue.getJob.mockResolvedValue(null);

      await expect(
        service.retryDeadLetterJob(TENANT_ID, 'missing'),
      ).rejects.toBeInstanceOf(DeadLetterJobNotFoundException);
    });

    it('应丢弃指定的失败任务', async () => {
      const mockJob = {
        id: 'job-1',
        data: { tenantId: TENANT_ID },
        remove: vi.fn(),
      };
      mockAgentTaskQueue.getJob.mockResolvedValue(mockJob);

      await service.discardDeadLetterJob(TENANT_ID, 'job-1');

      expect(mockAgentTaskQueue.getJob).toHaveBeenCalledWith('job-1');
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('应在丢弃不存在或越权任务时抛出异常', async () => {
      mockAgentTaskQueue.getJob.mockResolvedValue({
        id: 'job-foreign',
        data: { tenantId: 'other-tenant' },
        remove: vi.fn(),
      });

      await expect(
        service.discardDeadLetterJob(TENANT_ID, 'nonexistent'),
      ).rejects.toBeInstanceOf(DeadLetterJobNotFoundException);

      mockAgentTaskQueue.getJob.mockResolvedValue(null);

      await expect(
        service.discardDeadLetterJob(TENANT_ID, 'missing'),
      ).rejects.toBeInstanceOf(DeadLetterJobNotFoundException);
    });
  });
});
