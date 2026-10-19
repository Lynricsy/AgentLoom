/**
 * 团队运行时端到端（完整 AppModule + 真实 PostgreSQL/Redis/BullMQ）：
 * 工作流 `manual-trigger → text → team → json-output` 经真实调度器、对话执行队列与进程内 pi 运行时执行，
 * 成员模型由本文件内的 OpenAI 兼容假服务器按「场景 + 角色 + 回合」确定性地返回工具调用或文本。
 *
 * 场景：
 * - 完成：locator 发 observation 给 implementer，implementer 下一回合提交结果 → 步骤完成、下游收到 result-out；
 * - 预算：maxMessages=1，locator 连发两条 → 第二次返回「消息预算已耗尽」，步骤以 team/budget_exhausted 失败；
 * - 取消：成员模型请求挂起时取消执行 → 团队 cancelled，成员对话 ended。
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
import { TeamToolsProvider } from '../src/modules/team/team-tools.provider';
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
const WAIT_TIMEOUT_MS = 30_000;
const TEAM_ROLES = ['locator', 'implementer', 'verifier'] as const;
type TeamRole = (typeof TEAM_ROLES)[number];
type Scenario = 'complete' | 'budget' | 'cancel' | 'schema';

// ---------------------------------------------------------------------------
// OpenAI 兼容假模型（传输层见 support/fake-chat-model.ts）
// ---------------------------------------------------------------------------

interface MemberScript {
  /** 本成员已发出的工具调用次数 */
  toolCalls: number;
  /** 收到的请求数 */
  requests: number;
  /** 每次请求可用的工具名 */
  toolNames: string[][];
  /** schema 场景：lead 首次请求中从简报与提交工具描述读到的 Schema 原文 */
  seenSchemas?: { brief?: string; tool?: string };
}

/** 按「场景 + 角色 + 回合」记录每个成员的脚本状态，给出确定性回复 */
class FakeTeamModel {
  private readonly scripts = new Map<string, MemberScript>();

  script(runKey: string, role: TeamRole): MemberScript {
    const key = `${runKey}:${role}`;
    let script = this.scripts.get(key);
    if (!script) {
      script = { toolCalls: 0, requests: 0, toolNames: [] };
      this.scripts.set(key, script);
    }
    return script;
  }

  decide(body: FakeChatRequest): FakeReply {
    const messages = body.messages ?? [];
    const transcript = messages.map(messageText).join('\n');
    const role = /- 角色：([a-z][a-z0-9_-]*)/.exec(transcript)?.[1] as
      TeamRole | undefined;
    const scenario = /\[scenario:(\w+)\]/.exec(transcript)?.[1] as
      Scenario | undefined;
    const runKey = /\[run:([0-9a-f-]+)\]/.exec(transcript)?.[1];
    if (!role || !scenario || !runKey) {
      return { kind: 'text', text: '好的。' };
    }

    const script = this.script(runKey, role);
    script.requests += 1;
    script.toolNames.push(
      (body.tools ?? []).map((tool) => tool.function?.name ?? ''),
    );
    const last = messages[messages.length - 1];
    const reply = decideReply({
      scenario,
      role,
      script,
      lastRole: last?.role ?? '',
      transcript,
      submitToolDescription:
        body.tools?.find((tool) => tool.function?.name === 'team_submit_result')
          ?.function?.description ?? '',
    });
    if (reply.kind === 'tool') {
      script.toolCalls += 1;
    }
    return reply;
  }
}

/** 按场景与角色给出确定性回复；工具结果之后的请求一律以文本结束回合（除非脚本要求继续调用） */
function decideReply(params: {
  scenario: Scenario;
  role: TeamRole;
  script: MemberScript;
  lastRole: string;
  transcript: string;
  submitToolDescription: string;
}): FakeReply {
  const { scenario, role, script, lastRole, transcript } = params;

  if (scenario === 'cancel') {
    return { kind: 'hold' };
  }

  if (scenario === 'schema') {
    // lead 只能从它实际收到的内容（简报与提交工具描述）得知产物结构；任务文本不含结构
    if (role !== 'implementer' || lastRole === 'tool') {
      return { kind: 'text', text: '好的。' };
    }
    const briefSchema = /# 输出 Schema\n[^\n]*\n```json\n([\s\S]*?)\n```/.exec(
      transcript,
    )?.[1];
    const toolSchema = /\n(\{[\s\S]*\})$/.exec(
      params.submitToolDescription,
    )?.[1];
    script.seenSchemas = { brief: briefSchema, tool: toolSchema };
    return {
      kind: 'tool',
      name: 'team_submit_result',
      args: {
        summary: '按 Schema 提交',
        artifact: {
          ...artifactFromSchema(briefSchema),
          ...artifactFromSchema(toolSchema),
        },
      },
    };
  }

  if (scenario === 'complete') {
    if (role === 'locator') {
      if (script.toolCalls === 0) {
        return {
          kind: 'tool',
          name: 'team_send_message',
          args: {
            to: 'implementer',
            kind: 'observation',
            content: '问题定位在 src/auth.ts 的 token 校验分支',
            refs: ['src/auth.ts:42'],
          },
        };
      }
      return { kind: 'text', text: '发现已发送给 implementer。' };
    }
    if (role === 'implementer') {
      if (lastRole === 'tool') {
        return { kind: 'text', text: '结果已提交。' };
      }
      if (
        script.toolCalls === 0 &&
        transcript.includes('[来自 locator｜observation]')
      ) {
        return {
          kind: 'tool',
          name: 'team_submit_result',
          args: {
            summary: '修复 src/auth.ts 的 token 校验分支',
            artifact: { patch: '--- a/src/auth.ts\n+++ b/src/auth.ts' },
            knownLimitations: ['未覆盖刷新 token 路径'],
          },
        };
      }
      return { kind: 'text', text: '等待成员的发现。' };
    }
    return { kind: 'text', text: '暂无需要验证的产物。' };
  }

  // budget：locator 连发两条消息，第二条超出 maxMessages=1
  if (role === 'locator' && script.toolCalls < 2) {
    return {
      kind: 'tool',
      name: 'team_send_message',
      args: {
        to: 'implementer',
        kind: 'observation',
        content: `第 ${script.toolCalls + 1} 条发现`,
      },
    };
  }
  return { kind: 'text', text: '收到。' };
}

/** 按 Schema 的 required 字段构造最小合规产物；看不到 Schema 时返回空对象（会被校验拒绝） */
function artifactFromSchema(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as {
    properties?: Record<string, { type?: string; enum?: unknown[] }>;
    required?: string[];
  };
  return Object.fromEntries(
    (parsed.required ?? []).map((key) => {
      const property = parsed.properties?.[key] ?? {};
      return [
        key,
        property.enum?.[0] ?? (property.type === 'number' ? 1 : 'x'),
      ];
    }),
  );
}

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

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
    await sleep(200);
  }
  throw new Error(`等待超时：${description}（最后一次结果 ${String(last)}）`);
}

describe('Team runtime E2E（完整 AppModule + 假模型）', () => {
  let ctx: RlsTestContext;
  let appSql: postgres.Sql;
  let app: NestFastifyApplication;
  const fakeTeam = new FakeTeamModel();
  const fakeModel = new FakeChatModel((body) => fakeTeam.decide(body));
  const toolResults: Array<{
    teamRunId: string;
    role: string;
    tool: string;
    result: string;
  }> = [];

  let bullIsolation: BullMqIsolation;
  let tenantId: string;
  let headers: Record<string, string>;
  let userId: string;
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
    // 成员对话、执行 worker、团队清扫并发持有连接：应用使用独立的更大连接池
    appSql = postgres(ctx.container.getConnectionUri(), { max: 20 });
    const appDb = drizzle(appSql, { schema });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
      // 并行的其他 AppModule spec 也在同一 Redis 上跑 worker：独立前缀防止本 spec 的任务被其取走
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

    // 思考能力查询会访问外部 LiteLLM 目录：假模型不在其中，直接视为未知
    vi.spyOn(
      app.get(ModelDiscoveryService),
      'lookupLiteLLMEntry',
    ).mockResolvedValue(null);

    // 记录团队工具的返回文本（成员回合可能在工具返回后被团队结束中止，模型侧看不到结果）
    const toolsProvider = app.get(TeamToolsProvider);
    const createProvider =
      toolsProvider.createSessionToolProvider.bind(toolsProvider);
    vi.spyOn(toolsProvider, 'createSessionToolProvider').mockImplementation(
      (member) => {
        const provider = createProvider(member);
        return (...args) => {
          const toolSet = provider(...args);
          return Object.fromEntries(
            Object.entries(toolSet).map(([name, definition]) => [
              name,
              {
                ...definition,
                execute: async (
                  ...execArgs: Parameters<
                    NonNullable<typeof definition.execute>
                  >
                ) => {
                  const result = await definition.execute!(...execArgs);
                  toolResults.push({
                    teamRunId: member.teamRunId,
                    role: member.role,
                    tool: name,
                    result: String(result),
                  });
                  return result;
                },
              },
            ]),
          ) as typeof toolSet;
        };
      },
    );

    await seedTenantAndAgents();
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
    const email = `team-e2e-${userId.slice(0, 8)}@example.com`;
    tenantId = crypto.randomUUID();
    await seedAppUser(ctx.adminSql, userId, email);
    await seedOrg(
      ctx.adminSql,
      tenantId,
      'Team E2E org',
      `team-e2e-${tenantId.slice(0, 8)}`,
      userId,
      tenantId,
    );
    await seedMember(ctx.adminSql, tenantId, userId, 'owner', userId);
    await ctx.adminSql`
      UPDATE users SET current_organization_id = ${tenantId}::uuid
      WHERE id = ${userId}::uuid
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
        .send({ name: `Team ${role}`, runtimeMode: 'no_sandbox' });
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
        .send({ changelog: 'team e2e' });
      expect(version.status).toBe(201);

      const published = await request(server)
        .post(`/api/v1/agent-definitions/${agentId}/publish`)
        .set(headers)
        .send({ versionId: version.body.data.id });
      expect(published.status).toBe(200);
      agentIds[role] = agentId;
    }
  }

  async function startTeamWorkflow(params: {
    scenario: Scenario;
    maxMessages?: number;
    outputSchema?: postgres.JSONValue;
  }): Promise<{ executionId: string; runKey: string }> {
    const runKey = crypto.randomUUID();
    const workflowId = crypto.randomUUID();
    const taskText = `修复登录 token 校验问题 [scenario:${params.scenario}] [run:${runKey}]`;
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
      budget: {
        maxTotalTokens: 500_000,
        maxMessages: params.maxMessages ?? 30,
        deadlineMinutes: 10,
      },
      outputSchema: params.outputSchema ?? null,
    };

    await seedWorkflowDefinition(ctx.adminSql, {
      id: workflowId,
      tenantId,
      name: `Team ${params.scenario}`,
      slug: `team-${params.scenario}-${runKey.slice(0, 8)}`,
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
          data: { label: '任务', content: taskText },
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

    const server = app.getHttpServer();
    const published = await request(server)
      .post(`/api/v1/workflow-definitions/${workflowId}/publish`)
      .set(headers)
      .send({ label: 'v1' });
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    const run = await request(server)
      .post(`/api/v1/workflow-definitions/${workflowId}/run`)
      .set(headers)
      .send({ launchSource: 'web-studio' });
    expect(run.status, JSON.stringify(run.body)).toBe(202);
    return { executionId: run.body.data.id as string, runKey };
  }

  async function loadTeamRun(executionId: string) {
    const [run] = await ctx.adminSql<
      Array<{
        id: string;
        status: string;
        failure_reason: string | null;
        message_count: number;
      }>
    >`
      SELECT id, status, failure_reason, message_count FROM team_runs
      WHERE execution_id = ${executionId}::uuid
      ORDER BY created_at DESC LIMIT 1
    `;
    return run ?? null;
  }

  async function loadStep(executionId: string, nodeId: string) {
    const [step] = await ctx.adminSql<
      Array<{
        status: string;
        result: Record<string, unknown> | null;
        error_message: Record<string, unknown> | null;
      }>
    >`
      SELECT status, result, error_message FROM execution_steps
      WHERE execution_id = ${executionId}::uuid AND node_id = ${nodeId}
      ORDER BY created_at DESC LIMIT 1
    `;
    return step ?? null;
  }

  async function loadExecutionStatus(executionId: string) {
    const [row] = await ctx.adminSql<Array<{ status: string }>>`
      SELECT status FROM workflow_executions WHERE id = ${executionId}::uuid
    `;
    return row?.status ?? null;
  }

  async function loadMemberConversations(teamRunId: string) {
    return ctx.adminSql<
      Array<{
        role: string;
        member_status: string;
        conversation_status: string;
      }>
    >`
      SELECT m.role, m.status AS member_status, c.status AS conversation_status
      FROM team_members m
      JOIN agent_conversations c ON c.id = m.conversation_id
      WHERE m.team_run_id = ${teamRunId}::uuid
      ORDER BY m.role
    `;
  }

  it('locator 的发现送达 implementer，implementer 下一回合提交结果，步骤完成并驱动下游', async () => {
    const { executionId, runKey } = await startTeamWorkflow({
      scenario: 'complete',
    });

    const teamRun = await waitFor('团队运行 completed', async () => {
      const run = await loadTeamRun(executionId);
      return run?.status === 'completed' ? run : null;
    });

    // implementer 提交时可用 team_submit_result；非 lead 成员没有该工具
    expect(fakeTeam.script(runKey, 'implementer').toolNames[0]).toEqual(
      expect.arrayContaining(['team_send_message', 'team_submit_result']),
    );
    expect(fakeTeam.script(runKey, 'locator').toolNames[0]).not.toContain(
      'team_submit_result',
    );

    const messages = await waitFor(
      'observation 被 implementer 消费',
      async () => {
        const rows = await ctx.adminSql<
          Array<{
            kind: string;
            delivery_status: string;
            from_role: string;
            to_role: string;
          }>
        >`
        SELECT tm.kind, tm.delivery_status, s.role AS from_role, r.role AS to_role
        FROM team_messages tm
        JOIN team_members s ON s.id = tm.sender_member_id
        JOIN team_members r ON r.id = tm.recipient_member_id
        WHERE tm.team_run_id = ${teamRun.id}::uuid
      `;
        return rows.length > 0 &&
          rows.every((row) => row.delivery_status === 'consumed')
          ? rows
          : null;
      },
    );
    expect(messages).toEqual([
      {
        kind: 'observation',
        delivery_status: 'consumed',
        from_role: 'locator',
        to_role: 'implementer',
      },
    ]);

    const teamStep = await waitFor('team 步骤 completed', async () => {
      const step = await loadStep(executionId, 'team-1');
      return step?.status === 'completed' ? step : null;
    });
    const resultOut = teamStep.result?.['result-out'] as Record<string, any>;
    expect(resultOut).toMatchObject({
      teamRunId: teamRun.id,
      summary: '修复 src/auth.ts 的 token 校验分支',
      artifact: { patch: '--- a/src/auth.ts\n+++ b/src/auth.ts' },
      knownLimitations: ['未覆盖刷新 token 路径'],
      messageCount: 1,
    });
    expect(resultOut.usage.inputTokens).toBeGreaterThan(0);
    expect(resultOut.usage.outputTokens).toBeGreaterThan(0);
    expect(teamStep.result?.['summary-out']).toBe(
      '修复 src/auth.ts 的 token 校验分支',
    );

    const outStep = await waitFor('json-output 步骤 completed', async () => {
      const step = await loadStep(executionId, 'out');
      return step?.status === 'completed' ? step : null;
    });
    expect(JSON.stringify(outStep.result)).toContain(
      '修复 src/auth.ts 的 token 校验分支',
    );

    await waitFor('执行 completed', async () =>
      (await loadExecutionStatus(executionId)) === 'completed' ? true : null,
    );

    const conversations = await waitFor('成员对话全部 ended', async () => {
      const rows = await loadMemberConversations(teamRun.id);
      return rows.every((row) => row.conversation_status === 'ended')
        ? rows
        : null;
    });
    expect(conversations.map((row) => row.member_status)).toEqual([
      'ended',
      'ended',
      'ended',
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/team-runs/${teamRun.id}`)
      .set(headers);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('completed');
  }, 90_000);

  it('消息预算耗尽：第二次发送返回「消息预算已耗尽」，步骤以 team/budget_exhausted 失败', async () => {
    const { executionId } = await startTeamWorkflow({
      scenario: 'budget',
      maxMessages: 1,
    });

    const teamRun = await waitFor('团队运行 failed', async () => {
      const run = await loadTeamRun(executionId);
      return run?.status === 'failed' ? run : null;
    });
    expect(teamRun.failure_reason).toBe('budget_exhausted');
    expect(teamRun.message_count).toBe(1);

    // 发送工具在团队结束（取消成员、推进步骤）之后才返回，结果晚于 team_runs 状态可见
    const sends = await waitFor('第二次发送返回预算耗尽', async () => {
      const entries = toolResults.filter(
        (entry) =>
          entry.teamRunId === teamRun.id &&
          entry.tool === 'team_send_message' &&
          entry.role === 'locator',
      );
      return entries.length === 2 ? entries : null;
    });
    expect(JSON.parse(sends[0].result)).toMatchObject({
      deliveredTo: ['implementer'],
    });
    expect(sends[1].result).toBe('错误：消息预算已耗尽');

    const teamStep = await waitFor('team 步骤 failed', async () => {
      const step = await loadStep(executionId, 'team-1');
      return step?.status === 'failed' ? step : null;
    });
    expect(teamStep.error_message).toMatchObject({
      type: 'team/budget_exhausted',
    });

    await waitFor('执行 failed', async () =>
      (await loadExecutionStatus(executionId)) === 'failed' ? true : null,
    );
  }, 90_000);

  it('成员运行中取消执行：团队 cancelled，成员对话 ended', async () => {
    const { executionId } = await startTeamWorkflow({ scenario: 'cancel' });

    const teamRun = await waitFor('团队运行已创建', () =>
      loadTeamRun(executionId),
    );
    await waitFor('成员模型请求挂起中', async () =>
      fakeModel.heldCount() > 0 ? true : null,
    );
    await waitFor('至少一个成员 running', async () => {
      const rows = await loadMemberConversations(teamRun.id);
      return rows.some((row) => row.member_status === 'running') ? true : null;
    });

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/executions/${executionId}/cancel`)
      .set(headers);
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);

    const finalRun = await waitFor('团队运行 cancelled', async () => {
      const run = await loadTeamRun(executionId);
      return run?.status === 'cancelled' ? run : null;
    });
    expect(finalRun.failure_reason).toBe('cancelled');

    const conversations = await waitFor('成员对话全部 ended', async () => {
      const rows = await loadMemberConversations(teamRun.id);
      return rows.every((row) => row.conversation_status === 'ended')
        ? rows
        : null;
    });
    expect(conversations).toHaveLength(3);

    // 中止后挂起的模型请求随客户端断开而释放
    await waitFor('挂起请求释放', async () =>
      fakeModel.heldCount() === 0 ? true : null,
    );
    expect(await loadExecutionStatus(executionId)).toBe('cancelled');
  }, 90_000);

  it('仅在节点配置输出 Schema（任务文本不含结构）：lead 从简报与工具描述得到 Schema，一次提交即通过', async () => {
    const outputSchema = {
      type: 'object',
      properties: {
        patch: { type: 'string' },
        riskLevel: { type: 'string', enum: ['low', 'high'] },
      },
      required: ['patch', 'riskLevel'],
      additionalProperties: false,
    };
    const { executionId, runKey } = await startTeamWorkflow({
      scenario: 'schema',
      outputSchema,
    });

    const teamRun = await waitFor('团队运行 completed', async () => {
      const run = await loadTeamRun(executionId);
      return run?.status === 'completed' ? run : null;
    });

    const seen = fakeTeam.script(runKey, 'implementer').seenSchemas;
    expect(JSON.parse(seen?.brief ?? 'null')).toEqual(outputSchema);
    expect(JSON.parse(seen?.tool ?? 'null')).toEqual(outputSchema);

    const submits = toolResults.filter(
      (entry) =>
        entry.teamRunId === teamRun.id && entry.tool === 'team_submit_result',
    );
    expect(submits).toHaveLength(1);
    expect(submits[0].result).toMatch(/^已提交/);

    const teamStep = await waitFor('team 步骤 completed', async () => {
      const step = await loadStep(executionId, 'team-1');
      return step?.status === 'completed' ? step : null;
    });
    expect(teamStep.result?.['result-out']).toMatchObject({
      artifact: { patch: 'x', riskLevel: 'low' },
    });
  }, 90_000);
});
