import * as crypto from 'node:crypto';

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppSubmission,
} from '../../../database/schema';
import { WorkflowLaunchInputValidationException } from '../../execution/execution.exceptions';
import type { ExecutionService } from '../../execution/execution.service';
import {
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppPublicSubmissionValidationException,
} from '../generated-app.exceptions';
import { GeneratedAppRepository } from '../generated-app.repository';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';
import type {
  GeneratedAppRuntimeBindingService,
  GeneratedAppRuntimeTarget,
  GeneratedAppRuntimeUnavailable,
} from '../generated-app-runtime-binding.service';
import {
  APP_ID,
  GENERATION_RUN_ID,
  SUBMISSION_ID,
  TENANT_ID,
  USER_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_EXECUTION_ID,
  WORKFLOW_VERSION_ID,
  createConfigService,
  createGeneratedApp,
  createGeneratedAppSubmission,
  createPublishCandidateReadiness,
  createReadiness,
} from './generated-app-test-support';

// 租户事务在单测里直接复用传入的 db：被测的是事务内的读写，不是事务本身
vi.mock(
  '../../../common/interceptors/tenant-transaction.context',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    runInTenantTransaction: (
      db: unknown,
      _tenantId: string,
      operation: (db: unknown) => unknown,
    ) => operation(db),
  }),
);

const PUBLIC_TOKEN = 'a'.repeat(64);
const ACCEPTANCE_TOKEN = 'b'.repeat(64);
const dialect = new PgDialect();

function renderWhere(chain: { where: Mock }) {
  return dialect.sqlToQuery(chain.where.mock.calls[0]?.[0] as SQL);
}

function selectLimitChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function selectWhereChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain<T>(rows: T[] = []) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.where.mockReturnValue(chain);
  return chain;
}

function insertSubmissionChain() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => [
      createGeneratedAppSubmission({
        ...(chain.values.mock.calls[0]?.[0] as Partial<GeneratedAppSubmission>),
      }),
    ]),
  };
  return chain;
}

function createFakeDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
}

const AVAILABLE_TARGET: GeneratedAppRuntimeTarget = {
  available: true,
  workflowDefinitionId: WORKFLOW_DEFINITION_ID,
  workflowVersionId: WORKFLOW_VERSION_ID,
  inputSchemaVersion: 2,
  workflowStatus: 'published',
  publishedVersionId: WORKFLOW_VERSION_ID,
  drifted: false,
};

function publishedV2App(overrides: Partial<GeneratedApp> = {}): GeneratedApp {
  return createGeneratedApp({
    status: 'published',
    readiness: createPublishCandidateReadiness(),
    publicShareEnabled: true,
    publicShareToken: PUBLIC_TOKEN,
    ...overrides,
  });
}

describe('GeneratedAppPublicRuntimeService（AppSpec v2）', () => {
  let db: ReturnType<typeof createFakeDb>;
  let repository: GeneratedAppRepository;
  let runtimeBinding: { resolveRuntimeTarget: Mock };
  let execution: { runWorkflow: Mock };
  let service: GeneratedAppPublicRuntimeService;

  beforeEach(() => {
    db = createFakeDb();
    repository = new GeneratedAppRepository(
      db as unknown as DrizzleDB,
      createConfigService(),
    );
    runtimeBinding = {
      resolveRuntimeTarget: vi.fn().mockResolvedValue(AVAILABLE_TARGET),
    };
    execution = {
      runWorkflow: vi.fn().mockResolvedValue({
        id: WORKFLOW_EXECUTION_ID,
        status: 'pending',
      }),
    };
    service = new GeneratedAppPublicRuntimeService(
      repository,
      runtimeBinding as unknown as GeneratedAppRuntimeBindingService,
      execution as unknown as ExecutionService,
    );
  });

  function mockAccess(
    found: Awaited<
      ReturnType<GeneratedAppRepository['findByPublicOrAcceptanceToken']>
    >,
  ) {
    vi.spyOn(repository, 'findByPublicOrAcceptanceToken').mockResolvedValue(
      found,
    );
  }

  describe('公开页', () => {
    it('按 AppSpec 返回表单与结果视图，公开访问计一次浏览', async () => {
      const app = publishedV2App();
      mockAccess({ access: 'public', appId: APP_ID, tenantId: TENANT_ID, app });
      const viewUpdate = updateChain();
      db.update.mockReturnValueOnce(viewUpdate);

      const response = await service.getPublicApp(PUBLIC_TOKEN);

      expect(response).toMatchObject({
        appId: APP_ID,
        title: '文档问答',
        appSpec: { version: 2, appName: '文档问答' },
        runtimeForm: {
          title: '提问',
          submitLabel: '提问',
          fields: [
            expect.objectContaining({ id: 'question', type: 'textarea' }),
          ],
          resultView: {
            sections: [
              { id: 'answer', label: '答案', format: 'markdown' },
              { id: 'citations', label: '引用', format: 'citations' },
            ],
          },
        },
      });
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('验收令牌打开同一页面但不计浏览量、不要求发布门槛', async () => {
      const app = publishedV2App({
        status: 'app_spec_ready',
        readiness: createReadiness({
          state: 'blocked',
          canCreatePublicShare: false,
        }),
        publicShareEnabled: false,
        publicShareToken: null,
      });
      mockAccess({
        access: 'acceptance',
        appId: APP_ID,
        tenantId: TENANT_ID,
        generationRunId: GENERATION_RUN_ID,
        app,
      });

      await expect(
        service.getPublicApp(ACCEPTANCE_TOKEN),
      ).resolves.toMatchObject({
        runtimeForm: { fields: [expect.objectContaining({ id: 'question' })] },
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('令牌不存在（含验收令牌过期或已撤销）或尚未生成规格时 404', async () => {
      mockAccess(null);
      await expect(
        service.getPublicApp(ACCEPTANCE_TOKEN),
      ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);

      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App({ appSpec: null }),
      });
      await expect(service.getPublicApp(PUBLIC_TOKEN)).rejects.toBeInstanceOf(
        GeneratedAppNotFoundException,
      );
    });

    it('公开分享的应用不再满足发布门槛时 409', async () => {
      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App({
          readiness: createReadiness({
            state: 'blocked',
            canCreatePublicShare: false,
          }),
        }),
      });

      await expect(service.getPublicApp(PUBLIC_TOKEN)).rejects.toBeInstanceOf(
        GeneratedAppPublicShareNotReadyException,
      );
    });
  });

  describe('公开提交', () => {
    it('不合 AppSpec 的提交 422：不解析运行时、不执行、不落库', async () => {
      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App(),
      });

      const error = await service
        .createPublicSubmission(PUBLIC_TOKEN, {
          input: { question: '', chiefComplaint: '头痛' },
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(
        GeneratedAppPublicSubmissionValidationException,
      );
      expect(error).toMatchObject({
        errors: expect.arrayContaining([
          {
            field: 'input.chiefComplaint',
            message: '不是该应用表单声明的字段',
          },
          { field: 'input.question', message: '该字段为必填项' },
        ]),
      });
      expect(runtimeBinding.resolveRuntimeTarget).not.toHaveBeenCalled();
      expect(execution.runWorkflow).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('按 inputMapping 投影后以固定版本执行，提交记录 running 且公开响应不含执行引用', async () => {
      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App(),
      });
      const insert = insertSubmissionChain();
      db.insert.mockReturnValueOnce(insert);

      const response = await service.createPublicSubmission(PUBLIC_TOKEN, {
        input: { question: '  最多几个子 Agent？ ' },
        anonymousSessionId: 'visitor-1',
      });

      expect(execution.runWorkflow).toHaveBeenCalledWith(
        WORKFLOW_DEFINITION_ID,
        {
          inputParams: {
            question: '最多几个子 Agent？',
            _meta: {
              generatedAppId: APP_ID,
              submissionSource: 'generated-app-public-submission',
              anonymousSessionId: 'visitor-1',
            },
          },
          launchSource: 'api',
          triggerType: 'api',
          schemaVersion: 2,
          workflowVersionId: WORKFLOW_VERSION_ID,
        },
        TENANT_ID,
        USER_ID,
      );
      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          appSpecVersion: 2,
          origin: 'public',
          publicShareToken: PUBLIC_TOKEN,
          generationRunId: null,
          status: 'received',
          input: { question: '最多几个子 Agent？' },
          result: { status: 'running', sections: [], publicError: null },
          report: {
            kind: 'generated-app-runtime-execution',
            workflowDefinitionId: WORKFLOW_DEFINITION_ID,
            workflowVersionId: WORKFLOW_VERSION_ID,
            executionId: WORKFLOW_EXECUTION_ID,
            notStartedReason: null,
          },
        }),
      );
      expect(response.result).toEqual({
        status: 'running',
        sections: [],
        publicError: null,
      });
      expect(response).not.toHaveProperty('report');
      expect(JSON.stringify(response)).not.toContain(WORKFLOW_EXECUTION_ID);
    });

    it('验收令牌的提交标记 gate-acceptance、记生成运行且不存令牌', async () => {
      mockAccess({
        access: 'acceptance',
        appId: APP_ID,
        tenantId: TENANT_ID,
        generationRunId: GENERATION_RUN_ID,
        app: publishedV2App({
          status: 'app_spec_ready',
          publicShareToken: null,
        }),
      });
      const insert = insertSubmissionChain();
      db.insert.mockReturnValueOnce(insert);

      await service.createPublicSubmission(ACCEPTANCE_TOKEN, {
        input: { question: '最多几个子 Agent？' },
      });

      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'gate-acceptance',
          publicShareToken: null,
          generationRunId: GENERATION_RUN_ID,
        }),
      );
      expect(JSON.stringify(insert.values.mock.calls[0])).not.toContain(
        ACCEPTANCE_TOKEN,
      );
      expect(execution.runWorkflow.mock.calls[0]?.[1]).toMatchObject({
        inputParams: {
          _meta: {
            submissionSource: 'generated-app-gate-acceptance',
            generationRunId: GENERATION_RUN_ID,
          },
        },
      });
    });

    it('运行时绑定不可用时不执行，记一条 failed 提交，公开端只见通用原因', async () => {
      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App(),
      });
      runtimeBinding.resolveRuntimeTarget.mockResolvedValueOnce({
        available: false,
        state: 'workflow_not_published',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowStatus: 'draft',
        publishedVersionId: null,
        summary: '绑定的工作流当前未发布。',
      } satisfies GeneratedAppRuntimeUnavailable);
      const insert = insertSubmissionChain();
      db.insert.mockReturnValueOnce(insert);

      const response = await service.createPublicSubmission(PUBLIC_TOKEN, {
        input: { question: 'q' },
      });

      expect(execution.runWorkflow).not.toHaveBeenCalled();
      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          report: expect.objectContaining({
            executionId: null,
            notStartedReason: 'workflow_not_published',
          }),
        }),
      );
      expect(response).toMatchObject({
        status: 'failed',
        result: {
          status: 'failed',
          publicError: '应用暂时无法处理提交，请稍后再试或联系应用创建者。',
        },
      });
      expect(JSON.stringify(response)).not.toContain('未发布');
    });

    it('执行被领域规则拒绝时记 failed 与错误类型；其他错误照常抛出', async () => {
      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App(),
      });
      execution.runWorkflow.mockRejectedValueOnce(
        new WorkflowLaunchInputValidationException([
          { field: 'inputParams.question', message: '必填' },
        ]),
      );
      const insert = insertSubmissionChain();
      db.insert.mockReturnValueOnce(insert);

      const response = await service.createPublicSubmission(PUBLIC_TOKEN, {
        input: { question: 'q' },
      });

      expect(response.status).toBe('failed');
      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          report: expect.objectContaining({
            notStartedReason:
              'https://agentloom.dev/errors/workflow-launch-input-invalid',
          }),
        }),
      );

      execution.runWorkflow.mockRejectedValueOnce(
        new Error('connection reset'),
      );
      await expect(
        service.createPublicSubmission(PUBLIC_TOKEN, {
          input: { question: 'q' },
        }),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('提交结果刷新', () => {
    function runningSubmission(
      overrides: Partial<GeneratedAppSubmission> = {},
    ): GeneratedAppSubmission {
      return createGeneratedAppSubmission({
        appSpecVersion: 2,
        status: 'running',
        input: { question: 'q' },
        publicShareToken: PUBLIC_TOKEN,
        result: { status: 'running', sections: [], publicError: null },
        report: {
          kind: 'generated-app-runtime-execution',
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
          workflowVersionId: WORKFLOW_VERSION_ID,
          executionId: WORKFLOW_EXECUTION_ID,
          notStartedReason: null,
        },
        ...overrides,
      });
    }

    it('执行完成后按 outputMapping 抽取分区并落库，之后公开读取直接返回', async () => {
      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App(),
      });
      const submissionSelect = selectLimitChain([runningSubmission()]);
      const executionSelect = selectLimitChain([
        { status: 'completed', workflowDefinitionId: WORKFLOW_DEFINITION_ID },
      ]);
      const stepsSelect = selectWhereChain([
        {
          nodeId: 'out-answer',
          status: 'completed',
          result: { content: '最多 10 个。' },
        },
        {
          nodeId: 'out-structured',
          status: 'completed',
          result: {
            json: {
              citations: [{ doc: '宣传册', quote: '同时运行 10 个子 Agent' }],
            },
          },
        },
      ]);
      db.select
        .mockReturnValueOnce(submissionSelect)
        .mockReturnValueOnce(executionSelect)
        .mockReturnValueOnce(stepsSelect);
      const update = updateChain();
      update.returning.mockImplementation(async () => [
        runningSubmission(update.set.mock.calls[0]?.[0]),
      ]);
      db.update.mockReturnValueOnce(update);

      const response = await service.getPublicSubmission(
        PUBLIC_TOKEN,
        SUBMISSION_ID,
      );

      expect(update.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', errorMessage: null }),
      );
      expect(response).toMatchObject({
        status: 'completed',
        result: {
          status: 'completed',
          publicError: null,
          sections: [
            { sectionId: 'answer', value: '最多 10 个。' },
            {
              sectionId: 'citations',
              value: [{ title: '宣传册', quote: '同时运行 10 个子 Agent' }],
            },
          ],
        },
      });
      const executionQuery = renderWhere(executionSelect);
      expect(executionQuery.params).toEqual([WORKFLOW_EXECUTION_ID, TENANT_ID]);
    });

    it('执行记录不存在或不属于固定的工作流时判失败，不读取步骤', async () => {
      mockAccess({
        access: 'public',
        appId: APP_ID,
        tenantId: TENANT_ID,
        app: publishedV2App(),
      });
      db.select
        .mockReturnValueOnce(selectLimitChain([runningSubmission()]))
        .mockReturnValueOnce(
          selectLimitChain([
            { status: 'completed', workflowDefinitionId: 'another-workflow' },
          ]),
        );
      const update = updateChain();
      update.returning.mockImplementation(async () => [
        runningSubmission(update.set.mock.calls[0]?.[0]),
      ]);
      db.update.mockReturnValueOnce(update);

      const response = await service.getPublicSubmission(
        PUBLIC_TOKEN,
        SUBMISSION_ID,
      );

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(response).toMatchObject({
        status: 'failed',
        result: { publicError: '执行记录不可用，无法取得结果，请重新提交。' },
      });
    });

    it('验收令牌只能读取本次生成运行的 gate-acceptance 提交', async () => {
      mockAccess({
        access: 'acceptance',
        appId: APP_ID,
        tenantId: TENANT_ID,
        generationRunId: GENERATION_RUN_ID,
        app: publishedV2App(),
      });
      const submissionSelect = selectLimitChain([
        runningSubmission({ status: 'completed' }),
      ]);
      db.select.mockReturnValueOnce(submissionSelect);

      await service.getPublicSubmission(ACCEPTANCE_TOKEN, SUBMISSION_ID);

      const query = renderWhere(submissionSelect);
      expect(query.sql).toContain('"generated_app_submissions"."origin" = $');
      expect(query.sql).toContain(
        '"generated_app_submissions"."generation_run_id" = $',
      );
      expect(query.params).toEqual(
        expect.arrayContaining(['gate-acceptance', GENERATION_RUN_ID]),
      );
      expect(query.params).not.toContain(ACCEPTANCE_TOKEN);
    });

    it('创建者提交列表默认只看 public 来源', async () => {
      const page = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      db.select
        .mockReturnValueOnce(page)
        .mockReturnValueOnce(selectWhereChain([{ count: 0 }]));

      await service.listSubmissions(TENANT_ID, APP_ID, {
        page: 1,
        pageSize: 20,
        origin: 'public',
      });

      const query = renderWhere(page);
      expect(query.sql).toContain('"generated_app_submissions"."origin" = $');
      expect(query.params).toContain('public');
    });
  });
});

describe('GeneratedAppRepository 验收令牌', () => {
  let db: ReturnType<typeof createFakeDb>;
  let repository: GeneratedAppRepository;

  beforeEach(() => {
    db = createFakeDb();
    repository = new GeneratedAppRepository(
      db as unknown as DrizzleDB,
      createConfigService(),
    );
  });

  it('签发 32 字节 hex 令牌，库里只存 sha256 与到期时间、所属生成运行', async () => {
    const update = updateChain([{ id: APP_ID }]);
    db.update.mockReturnValueOnce(update);
    const before = Date.now();

    const { token, expiresAt } = await repository.issueAcceptanceToken({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: GENERATION_RUN_ID,
      ttlMs: 60_000,
    });

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(60_000);
    expect(expiresAt.getTime() - before).toBeLessThan(65_000);
    expect(update.set).toHaveBeenCalledWith({
      acceptanceTokenHash: crypto
        .createHash('sha256')
        .update(token)
        .digest('hex'),
      acceptanceTokenExpiresAt: expiresAt,
      acceptanceGenerationRunId: GENERATION_RUN_ID,
    });
    expect(JSON.stringify(update.set.mock.calls)).not.toContain(token);
  });

  it('应用不存在时签发失败', async () => {
    db.update.mockReturnValueOnce(updateChain([]));

    await expect(
      repository.issueAcceptanceToken({
        tenantId: TENANT_ID,
        appId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        ttlMs: 1000,
      }),
    ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);
  });

  it('撤销清空哈希、到期时间与生成运行', async () => {
    const update = updateChain();
    db.update.mockReturnValueOnce(update);

    await repository.revokeAcceptanceToken(TENANT_ID, APP_ID);

    expect(update.set).toHaveBeenCalledWith({
      acceptanceTokenHash: null,
      acceptanceTokenExpiresAt: null,
      acceptanceGenerationRunId: null,
    });
    expect(renderWhere(update).params).toEqual([APP_ID, TENANT_ID]);
  });

  it('先按公开分享令牌查已发布应用，再按未过期验收令牌的 sha256 查', async () => {
    const publicSelect = selectLimitChain([]);
    const app = createGeneratedApp({
      acceptanceTokenHash: 'x',
      acceptanceGenerationRunId: GENERATION_RUN_ID,
    });
    const acceptanceSelect = selectLimitChain([app]);
    db.select
      .mockReturnValueOnce(publicSelect)
      .mockReturnValueOnce(acceptanceSelect);

    const found =
      await repository.findByPublicOrAcceptanceToken(ACCEPTANCE_TOKEN);

    expect(found).toMatchObject({
      access: 'acceptance',
      appId: APP_ID,
      tenantId: TENANT_ID,
      generationRunId: GENERATION_RUN_ID,
    });
    const publicQuery = renderWhere(publicSelect);
    expect(publicQuery.params).toEqual([ACCEPTANCE_TOKEN, true, 'published']);
    const acceptanceQuery = renderWhere(acceptanceSelect);
    expect(acceptanceQuery.sql).toContain(
      '"generated_apps"."acceptance_token_expires_at" > $2',
    );
    expect(acceptanceQuery.sql).toContain(
      '"generated_apps"."acceptance_generation_run_id" is not null',
    );
    expect(acceptanceQuery.params[0]).toBe(
      crypto.createHash('sha256').update(ACCEPTANCE_TOKEN).digest('hex'),
    );
    expect(acceptanceQuery.params).not.toContain(ACCEPTANCE_TOKEN);
  });

  it('过期或已撤销（两次查询都无结果）返回 null；非法令牌不查库', async () => {
    db.select
      .mockReturnValueOnce(selectLimitChain([]))
      .mockReturnValueOnce(selectLimitChain([]));

    await expect(
      repository.findByPublicOrAcceptanceToken(ACCEPTANCE_TOKEN),
    ).resolves.toBeNull();

    db.select.mockClear();
    await expect(
      repository.findByPublicOrAcceptanceToken('../etc/passwd'),
    ).resolves.toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });
});
