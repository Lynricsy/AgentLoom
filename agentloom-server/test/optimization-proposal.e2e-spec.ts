/**
 * 证据驱动配置优化端到端（完整 AppModule + 真实 PostgreSQL/Redis/BullMQ + 假模型）：
 * 团队节点 maxMessages=1 → 三次真实运行都因消息预算耗尽失败 → 分析生成「消息数上限 1 → 2」提案 →
 * 评测回放这三次输入到基线（v1）与候选版本 → 候选全部完成、结论 improved → 发布候选版本 →
 * 发布前的在途执行仍按 v1 运行（不漂移）→ 回滚恢复 v1。
 *
 * 假模型只看 transcript、不保存状态：同一输入在基线与候选版本下的差异只来自预算配置。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

import * as crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as jwt from 'jsonwebtoken';
import postgres from 'postgres';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE } from '../src/database/database.module';
import * as schema from '../src/database/schema/index';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { ModelDiscoveryService } from '../src/modules/llm/model-discovery.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  seedWorkflowDefinition,
  type RlsTestContext,
} from './rls/rls-test-utils';
import {
  createBullMqIsolation,
  type BullMqIsolation,
} from './support/bullmq-isolation';
import {
  FakeChatModel,
  messageText,
  type FakeChatRequest,
  type FakeReply,
} from './support/fake-chat-model';

const JWT_SECRET = 'test-e2e-jwt-secret';
const WAIT_TIMEOUT_MS = 45_000;
const TEAM_ROLES = ['locator', 'implementer', 'verifier'] as const;
type TeamRole = (typeof TEAM_ROLES)[number];
const TASK_TEXT = '修复登录 token 校验问题 [scenario:budget]';
const OBSERVATION_MARK = '[来自 locator｜observation]';

/**
 * locator：发出两条发现后结束回合；implementer：看到两条发现且尚未提交时提交结果。
 * maxMessages=1 时第二条发现被预算拒绝 → 团队 budget_exhausted；maxMessages=2 时团队完成。
 */
function decide(body: FakeChatRequest): FakeReply {
  const messages = body.messages ?? [];
  const transcript = messages.map(messageText).join('\n');
  if (!transcript.includes('[scenario:budget]')) {
    return { kind: 'text', text: '好的。' };
  }
  const role = /- 角色：([a-z][a-z0-9_-]*)/.exec(transcript)?.[1];
  const last = messages[messages.length - 1];

  if (role === 'locator') {
    const toolResults = messages.filter((message) => message.role === 'tool');
    if (toolResults.length < 2) {
      return {
        kind: 'tool',
        name: 'team_send_message',
        args: {
          to: 'implementer',
          kind: 'observation',
          content: `第 ${toolResults.length + 1} 条发现`,
        },
      };
    }
    return { kind: 'text', text: '收到。' };
  }

  if (role === 'implementer') {
    if (last?.role === 'tool') {
      return { kind: 'text', text: '结果已提交。' };
    }
    const submitted = messages.some((message) =>
      message.tool_calls?.some(
        (call) => call.function?.name === 'team_submit_result',
      ),
    );
    const observations = transcript.split(OBSERVATION_MARK).length - 1;
    if (!submitted && observations >= 2) {
      return {
        kind: 'tool',
        name: 'team_submit_result',
        args: {
          summary: '已整合两条发现',
          artifact: { patch: '--- a/src/auth.ts\n+++ b/src/auth.ts' },
        },
      };
    }
    return { kind: 'text', text: '等待成员的发现。' };
  }

  return { kind: 'text', text: '暂无需要验证的产物。' };
}

function authHeaders(user: { id: string; email: string }, tenantId: string) {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: 'owner',
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { authorization: `Bearer ${token}` };
}

async function waitFor<T>(
  description: string,
  probe: () => Promise<T | null | undefined | false>,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) {
      return value;
    }
    last = value;
    await sleep(250);
  }
  throw new Error(`等待超时：${description}（最后一次结果 ${String(last)}）`);
}

type TeamNodeRow = { id: string; data: Record<string, any> };
const teamNodeOf = (nodes: TeamNodeRow[]) =>
  nodes.find((node) => node.id === 'team-1');

describe('Optimization proposal E2E（证据 → 提案 → 评测 → 发布 → 回滚）', () => {
  let ctx: RlsTestContext;
  let appSql: postgres.Sql;
  let app: NestFastifyApplication;
  const fakeModel = new FakeChatModel(decide);
  let bullIsolation: BullMqIsolation;

  let tenantId: string;
  let userId: string;
  let headers: Record<string, string>;
  let workflowId: string;
  let versionA: string;
  let versionC: string;
  let proposalId: string;
  let inFlightExecutionId: string;
  const agentIds: Record<TeamRole, string> = {
    locator: '',
    implementer: '',
    verifier: '',
  };

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;
    await fakeModel.start();
    ctx = await createRlsTestContext();
    bullIsolation = createBullMqIsolation();
    appSql = postgres(ctx.container.getConnectionUri(), { max: 30 });
    const appDb = drizzle(appSql, { schema });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue({
        signUp: vi.fn(),
        signIn: vi.fn(),
        refreshToken: vi.fn(),
        signOut: vi.fn(),
        getUser: vi.fn(),
      })
      .overrideProvider(DRIZZLE)
      .useValue(appDb)
      .overrideProvider(bullIsolation.token)
      .useValue(bullIsolation.config)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    vi.spyOn(
      app.get(ModelDiscoveryService),
      'lookupLiteLLMEntry',
    ).mockResolvedValue(null);

    await seedTenantAndAgents();
    await seedWorkflow();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await bullIsolation?.cleanup();
    await fakeModel.stop();
    await appSql?.end();
    await ctx?.close();
  }, 60_000);

  async function seedTenantAndAgents(): Promise<void> {
    userId = crypto.randomUUID();
    const email = `opt-e2e-${userId.slice(0, 8)}@example.com`;
    tenantId = crypto.randomUUID();
    await seedAppUser(ctx.adminSql, userId, email);
    await seedOrg(
      ctx.adminSql,
      tenantId,
      'Optimization E2E org',
      `opt-e2e-${tenantId.slice(0, 8)}`,
      userId,
      tenantId,
    );
    await seedMember(ctx.adminSql, tenantId, userId, 'owner', userId);
    await ctx.adminSql`
      UPDATE users SET current_organization_id = ${tenantId}::uuid
      WHERE id = ${userId}::uuid
    `;
    // 评测阶段按 250ms 轮询；全量 e2e 并行时评测变慢，默认 100 次/分钟的租户 API 限流
    // 会让轮询自身被 429 挡住直到超时。测试租户放宽限流，轮询不再影响被测行为。
    await ctx.adminSql`
      INSERT INTO tenant_quotas (
        organization_id, tenant_id, api_rate_limit_per_minute, created_by, updated_by
      ) VALUES (
        ${tenantId}::uuid, ${tenantId}::uuid, 6000, ${userId}::uuid, ${userId}::uuid
      )
    `;
    headers = authHeaders({ id: userId, email }, tenantId);

    const [provider] = await ctx.adminSql<{ id: string }[]>`
      INSERT INTO llm_providers (org_id, tenant_id, slug, name, base_url, api_protocol)
      VALUES (${tenantId}::uuid, ${tenantId}::uuid, 'custom', 'Fake OpenAI',
              ${fakeModel.baseUrl}, 'openai_chat')
      RETURNING id
    `;
    const [model] = await ctx.adminSql<{ id: string }[]>`
      INSERT INTO llm_model_configs (
        org_id, tenant_id, provider_id, name, model_id, context_window,
        max_output_tokens, pricing
      ) VALUES (
        ${tenantId}::uuid, ${tenantId}::uuid, ${provider.id}::uuid, 'Fake Team Model',
        'fake-team-model', 128000, 1024,
        ${ctx.adminSql.json({ inputPer1MTokens: 1, outputPer1MTokens: 2 })}
      )
      RETURNING id
    `;

    const server = app.getHttpServer();
    for (const role of TEAM_ROLES) {
      const created = await request(server)
        .post('/api/v1/agent-definitions')
        .set(headers)
        .send({ name: `Opt ${role}`, runtimeMode: 'no_sandbox' });
      expect(created.status).toBe(201);
      const agentId: string = created.body.data.id;

      const canvas = await request(server)
        .put(`/api/v1/agent-definitions/${agentId}/canvas`)
        .set(headers)
        .send({
          canvasNodes: [
            {
              id: 'agent-main-node',
              type: 'agent-main',
              position: { x: 0, y: 0 },
              data: { label: 'Agent Main' },
            },
            {
              id: 'model-node',
              type: 'llm-model',
              position: { x: -200, y: 0 },
              data: { label: '模型', llmConfigId: model.id },
            },
          ],
          canvasEdges: [
            {
              id: 'edge-model',
              source: 'model-node',
              sourceHandle: 'model-out',
              target: 'agent-main-node',
              targetHandle: 'model-in',
            },
          ],
          canvasViewport: { x: 0, y: 0, zoom: 1 },
        });
      expect(canvas.status).toBe(200);

      const version = await request(server)
        .post(`/api/v1/agent-definitions/${agentId}/versions`)
        .set(headers)
        .send({ changelog: 'optimization e2e' });
      expect(version.status).toBe(201);

      const published = await request(server)
        .post(`/api/v1/agent-definitions/${agentId}/publish`)
        .set(headers)
        .send({ versionId: version.body.data.id });
      expect(published.status).toBe(200);
      agentIds[role] = agentId;
    }
  }

  async function seedWorkflow(): Promise<void> {
    workflowId = crypto.randomUUID();
    const teamConfig = {
      objective: '定位并修复缺陷',
      members: [
        {
          role: 'locator',
          agentDefinitionId: agentIds.locator,
          isLead: false,
          instructions: '只读定位并把发现发给 implementer。',
          canMessage: ['implementer', 'verifier'],
        },
        {
          role: 'implementer',
          agentDefinitionId: agentIds.implementer,
          isLead: true,
          instructions: '整合发现并提交结果。',
          canMessage: ['*'],
        },
        {
          role: 'verifier',
          agentDefinitionId: agentIds.verifier,
          isLead: false,
          instructions: '验证产物。',
          canMessage: ['implementer'],
        },
      ],
      budget: { maxTotalTokens: 500_000, maxMessages: 1, deadlineMinutes: 10 },
      outputSchema: null,
    };
    await seedWorkflowDefinition(ctx.adminSql, {
      id: workflowId,
      tenantId,
      name: 'Optimization budget',
      slug: `opt-budget-${workflowId.slice(0, 8)}`,
      createdBy: userId,
      updatedBy: userId,
      nodes: [
        {
          id: 'trigger',
          type: 'manual-trigger',
          position: { x: 0, y: 0 },
          data: { label: '开始' },
        },
        {
          id: 'task',
          type: 'text',
          position: { x: 0, y: 200 },
          data: { label: '任务', content: TASK_TEXT },
        },
        {
          id: 'team-1',
          type: 'team',
          position: { x: 300, y: 0 },
          data: { label: '团队', config: teamConfig },
        },
        {
          id: 'out',
          type: 'json-output',
          position: { x: 600, y: 0 },
          data: { label: '结果' },
        },
      ],
      edges: [
        {
          id: 'e-trigger-team',
          source: 'trigger',
          sourceHandle: 'exec-out',
          target: 'team-1',
          targetHandle: 'exec-in',
        },
        {
          id: 'e-task-team',
          source: 'task',
          sourceHandle: 'text-out',
          target: 'team-1',
          targetHandle: 'task-in',
        },
        {
          id: 'e-team-out-exec',
          source: 'team-1',
          sourceHandle: 'exec-out',
          target: 'out',
          targetHandle: 'exec-in',
        },
        {
          id: 'e-team-out-result',
          source: 'team-1',
          sourceHandle: 'result-out',
          target: 'out',
          targetHandle: 'content-in',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const published = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/publish`)
      .set(headers)
      .send({ label: 'v1' });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    versionA = published.body.data.id;
  }

  async function runWorkflow(): Promise<string> {
    const run = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/run`)
      .set(headers)
      .send({ launchSource: 'api' });
    expect(run.status, JSON.stringify(run.body)).toBe(202);
    return run.body.data.id as string;
  }

  async function loadExecution(executionId: string) {
    const [row] = await ctx.adminSql<
      Array<{
        status: string;
        workflow_version_id: string;
        trigger_type: string;
        input_params: Record<string, any>;
        definition_snapshot: { nodes: TeamNodeRow[] };
      }>
    >`
      SELECT status, workflow_version_id, trigger_type, input_params, definition_snapshot
      FROM workflow_executions WHERE id = ${executionId}::uuid
    `;
    return row ?? null;
  }

  async function loadTeamRun(executionId: string) {
    const [row] = await ctx.adminSql<
      Array<{
        status: string;
        failure_reason: string | null;
        message_count: number;
        config: { budget: { maxMessages: number } };
      }>
    >`
      SELECT status, failure_reason, message_count, config FROM team_runs
      WHERE execution_id = ${executionId}::uuid
      ORDER BY created_at DESC LIMIT 1
    `;
    return row ?? null;
  }

  const waitExecutionTerminal = (executionId: string) =>
    waitFor(`执行 ${executionId} 终态`, async () => {
      const execution = await loadExecution(executionId);
      return execution &&
        ['completed', 'failed', 'cancelled'].includes(execution.status)
        ? execution
        : null;
    });

  async function loadDraftTeamNode() {
    const [row] = await ctx.adminSql<
      Array<{ nodes: TeamNodeRow[]; published_version_id: string }>
    >`
      SELECT nodes, published_version_id FROM workflow_definitions
      WHERE id = ${workflowId}::uuid
    `;
    return {
      teamNode: teamNodeOf(row.nodes),
      publishedVersionId: row.published_version_id,
    };
  }

  it('1. 三次真实运行都因消息预算耗尽失败', async () => {
    const ids = [await runWorkflow(), await runWorkflow(), await runWorkflow()];
    for (const id of ids) {
      const execution = await waitExecutionTerminal(id);
      expect(execution.status).toBe('failed');
      expect(execution.workflow_version_id).toBe(versionA);
      const teamRun = await waitFor('团队运行终态', async () => {
        const run = await loadTeamRun(id);
        return run && run.status !== 'running' ? run : null;
      });
      expect(teamRun.failure_reason).toBe('budget_exhausted');
    }
  }, 120_000);

  it('2. 分析生成「消息数上限 1 → 2」提案，重复分析不重复创建', async () => {
    const server = app.getHttpServer();
    const analyzed = await request(server)
      .post('/api/v1/optimization-proposals/analyze')
      .set(headers)
      .send({ workflowDefinitionId: workflowId });
    expect(analyzed.status, JSON.stringify(analyzed.body)).toBe(201);
    expect(analyzed.body.data).toHaveLength(1);
    const [proposal] = analyzed.body.data;
    expect(proposal).toMatchObject({
      proposalType: 'team_budget_messages',
      configPath: 'config.budget.maxMessages',
      currentValue: 1,
      proposedValue: 2,
      status: 'proposed',
      baseVersionId: versionA,
      nodeId: 'team-1',
      evidence: { matchedCount: 3, sampleCount: 3 },
    });
    proposalId = proposal.id;

    const again = await request(server)
      .post('/api/v1/optimization-proposals/analyze')
      .set(headers)
      .send({ workflowDefinitionId: workflowId });
    expect(again.status).toBe(201);
    expect(again.body.data).toEqual([]);
  });

  it('3. 未评测的提案不能发布', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/optimization-proposals/${proposalId}/publish`)
      .set(headers)
      .send({});
    expect(response.status).toBe(409);
    expect(response.body.type).toContain(
      'optimization-proposal-status-conflict',
    );
  });

  it('4-5. 评测：基线 3 次失败、候选 3 次完成，结论 improved', async () => {
    // 发布前启动的在途执行，用于验证发布后不漂移
    inFlightExecutionId = await runWorkflow();

    const server = app.getHttpServer();
    const started = await request(server)
      .post(`/api/v1/optimization-proposals/${proposalId}/evaluate`)
      .set(headers)
      .send({ caseCount: 3 });
    expect(started.status, JSON.stringify(started.body)).toBe(202);
    expect(started.body.data.status).toBe('evaluating');
    versionC = started.body.data.candidateVersionId;
    expect(versionC).toBeTruthy();

    const [candidate] = await ctx.adminSql<
      Array<{
        label: string;
        published_at: Date | null;
        snapshot: { nodes: TeamNodeRow[] };
      }>
    >`SELECT label, published_at, snapshot FROM workflow_versions WHERE id = ${versionC}::uuid`;
    expect(candidate.published_at).toBeNull();
    expect(candidate.label).toMatch(/^优化提案/);
    expect(
      teamNodeOf(candidate.snapshot.nodes)?.data.config.budget.maxMessages,
    ).toBe(2);

    const detail = await waitFor(
      '评测完成',
      async () => {
        const response = await request(server)
          .get(`/api/v1/optimization-proposals/${proposalId}`)
          .set(headers);
        return response.body.data?.latestEvaluation?.status === 'completed'
          ? response.body.data
          : null;
      },
      120_000,
    );

    expect(detail.status).toBe('evaluated');
    expect(detail.verdict).toBe('improved');
    const evaluation = detail.latestEvaluation;
    expect(evaluation.summary).toMatchObject({
      baseline: { passRate: 0, cases: 3 },
      candidate: { passRate: 1, cases: 3 },
      verdict: 'improved',
    });
    expect(evaluation.runs).toHaveLength(6);

    for (const run of evaluation.runs) {
      const execution = await loadExecution(run.executionId);
      expect(execution?.trigger_type).toBe('system');
      expect(execution?.input_params._meta.launchSource).toBe('evaluation');
      // 终态事件即时结算，不依赖 60 秒清扫（D-161）
      const [terminal] = await ctx.adminSql<Array<{ at: Date }>>`
        SELECT coalesce(completed_at, failed_at, cancelled_at) AS at
        FROM workflow_executions WHERE id = ${run.executionId}::uuid
      `;
      expect(
        new Date(run.completedAt).getTime() - terminal.at.getTime(),
      ).toBeLessThan(5_000);
      const teamRun = await loadTeamRun(run.executionId);
      if (run.arm === 'baseline') {
        expect(run.status).toBe('failed');
        expect(run.metrics.team.failureReason).toBe('budget_exhausted');
        expect(execution?.workflow_version_id).toBe(versionA);
      } else {
        expect(run.status).toBe('completed');
        expect(run.metrics.passed).toBe(true);
        expect(execution?.workflow_version_id).toBe(versionC);
        expect(teamRun?.message_count).toBe(2);
      }
    }
  }, 180_000);

  it('6. 发布候选版本：发布版本切换、草稿同步、审计留痕', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/optimization-proposals/${proposalId}/publish`)
      .set(headers)
      .send({ label: 'v2 via proposal' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'published',
      publishedVersionId: versionC,
      publishReport: { draftSynced: true, note: null },
    });

    const versions = await ctx.adminSql<
      Array<{ id: string; label: string | null; published_at: Date | null }>
    >`
      SELECT id, label, published_at FROM workflow_versions
      WHERE id IN (${versionA}::uuid, ${versionC}::uuid)
    `;
    const byId = new Map(versions.map((row) => [row.id, row]));
    expect(byId.get(versionC)?.published_at).not.toBeNull();
    expect(byId.get(versionC)?.label).toBe('v2 via proposal');
    expect(byId.get(versionA)?.published_at).toBeNull();

    const draft = await loadDraftTeamNode();
    expect(draft.publishedVersionId).toBe(versionC);
    expect(draft.teamNode?.data.config.budget.maxMessages).toBe(2);

    const audits = await ctx.adminSql<Array<{ event_type: string }>>`
      SELECT event_type FROM audit_logs
      WHERE tenant_id = ${tenantId}::uuid AND event_type = 'optimization.proposal.published'
    `;
    expect(audits).toHaveLength(1);
  });

  it('7. 不漂移：发布前的在途执行仍按 v1 运行；发布后新执行使用候选版本并完成', async () => {
    const inFlight = await waitExecutionTerminal(inFlightExecutionId);
    expect(inFlight.workflow_version_id).toBe(versionA);
    expect(
      teamNodeOf(inFlight.definition_snapshot.nodes)?.data.config.budget
        .maxMessages,
    ).toBe(1);
    const inFlightTeam = await loadTeamRun(inFlightExecutionId);
    expect(inFlightTeam?.config.budget.maxMessages).toBe(1);
    expect(inFlightTeam?.failure_reason).toBe('budget_exhausted');

    const afterPublish = await runWorkflow();
    const execution = await waitExecutionTerminal(afterPublish);
    expect(execution.workflow_version_id).toBe(versionC);
    expect(execution.status).toBe('completed');
    const teamRun = await loadTeamRun(afterPublish);
    expect(teamRun).toMatchObject({ status: 'completed', message_count: 2 });
  }, 120_000);

  it('8. 回滚：重新发布 v1、草稿回写，新执行再次预算耗尽', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/optimization-proposals/${proposalId}/rollback`)
      .set(headers)
      .send({});
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.status).toBe('rolled_back');

    const draft = await loadDraftTeamNode();
    expect(draft.publishedVersionId).toBe(versionA);
    expect(draft.teamNode?.data.config.budget.maxMessages).toBe(1);

    const afterRollback = await runWorkflow();
    const execution = await waitExecutionTerminal(afterRollback);
    expect(execution.workflow_version_id).toBe(versionA);
    expect(execution.status).toBe('failed');
    expect((await loadTeamRun(afterRollback))?.failure_reason).toBe(
      'budget_exhausted',
    );
  }, 120_000);

  it('9. 跨租户不可见', async () => {
    const otherUserId = crypto.randomUUID();
    const otherTenantId = crypto.randomUUID();
    const otherEmail = `opt-other-${otherUserId.slice(0, 8)}@example.com`;
    await seedAppUser(ctx.adminSql, otherUserId, otherEmail);
    await seedOrg(
      ctx.adminSql,
      otherTenantId,
      'Other org',
      `opt-other-${otherTenantId.slice(0, 8)}`,
      otherUserId,
      otherTenantId,
    );
    await seedMember(
      ctx.adminSql,
      otherTenantId,
      otherUserId,
      'owner',
      otherUserId,
    );
    await ctx.adminSql`
      UPDATE users SET current_organization_id = ${otherTenantId}::uuid
      WHERE id = ${otherUserId}::uuid
    `;
    const otherHeaders = authHeaders(
      { id: otherUserId, email: otherEmail },
      otherTenantId,
    );
    const server = app.getHttpServer();

    const list = await request(server)
      .get('/api/v1/optimization-proposals')
      .set(otherHeaders);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);
    expect(list.body.meta.total).toBe(0);

    const detail = await request(server)
      .get(`/api/v1/optimization-proposals/${proposalId}`)
      .set(otherHeaders);
    expect(detail.status).toBe(404);
  });

  it('10. 忽略后同样的证据不再提案；出现新的命中运行后重新提案（D-161）', async () => {
    const server = app.getHttpServer();
    const analyze = () =>
      request(server)
        .post('/api/v1/optimization-proposals/analyze')
        .set(headers)
        .send({ workflowDefinitionId: workflowId });

    // 回滚后提案不再活跃，基线 v1 上的失败证据重新生成提案
    const first = await analyze();
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data).toHaveLength(1);
    const dismissed = await request(server)
      .post(`/api/v1/optimization-proposals/${first.body.data[0].id}/dismiss`)
      .set(headers)
      .send({});
    expect(dismissed.status, JSON.stringify(dismissed.body)).toBe(200);

    const again = await analyze();
    expect(again.status).toBe(201);
    expect(again.body.data).toEqual([]);

    const newRun = await runWorkflow();
    expect((await waitExecutionTerminal(newRun)).status).toBe('failed');
    await waitFor('团队运行终态', async () => {
      const run = await loadTeamRun(newRun);
      return run && run.status !== 'running' ? run : null;
    });
    const afterNewEvidence = await analyze();
    expect(afterNewEvidence.status).toBe(201);
    expect(afterNewEvidence.body.data).toHaveLength(1);
    expect(afterNewEvidence.body.data[0].evidence.matchedCount).toBe(
      first.body.data[0].evidence.matchedCount + 1,
    );
  }, 120_000);
});
