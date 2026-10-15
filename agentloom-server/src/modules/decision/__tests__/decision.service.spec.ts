import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { DrizzleDB } from '../../../database/database.module';
import { DecisionService } from '../decision.service';
import type { TeamMessageRelevanceInput } from '../decision.types';
import { JevClient } from '../providers/jev-client';
import { JevDecisionProvider } from '../providers/jev-decision.provider';
import { RuleDecisionProvider } from '../providers/rule-decision.provider';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const SUBJECT_ID = '019577a0-0000-7000-8000-0000000000aa';

const TEAM_INPUT: TeamMessageRelevanceInput = {
  recipient: { role: 'implementer', instructions: '整合', recentOutput: null },
  message: {
    fromRole: 'locator',
    kind: 'observation',
    content: '在 src/a.ts:10 发现空指针',
    refs: ['src/a.ts:10'],
  },
};

function createDb() {
  const txValues = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([{ id: 'primary-record-1' }]),
  }));
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({ values: txValues })),
  };
  const rawValues = vi.fn().mockResolvedValue(undefined);
  const db = {
    transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
      operation(tx),
    ),
    insert: vi.fn(() => ({ values: rawValues })),
  };
  return { db, tx, txValues, rawValues };
}

function createService(env: Record<string, unknown>) {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const mocks = createDb();
  const service = new DecisionService(
    mocks.db as unknown as DrizzleDB,
    new RuleDecisionProvider(),
    new JevDecisionProvider(new JevClient(config)),
    config,
  );
  return { service, ...mocks };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DecisionService', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('规则结果在租户事务内写 primary 记录并返回；未配 Key 不调用 Jev', async () => {
    const { service, db, tx, txValues, rawValues } = createService({});

    const result = await service.decide({
      kind: 'team.message_relevance',
      tenantId: TENANT_ID,
      subject: { type: 'team_message', id: SUBJECT_ID },
      input: TEAM_INPUT,
    });
    await service.drainShadows();

    expect(result).toEqual({
      outcome: { type: 'noul', value: 1 },
      recordId: 'primary-record-1',
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(txValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        kind: 'team.message_relevance',
        subjectType: 'team_message',
        subjectId: SUBJECT_ID,
        provider: 'rule',
        mode: 'primary',
        definitionVersion: 1,
        inputDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        outcome: { type: 'noul', value: 1 },
        confidence: null,
        latencyMs: expect.any(Number),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rawValues).not.toHaveBeenCalled();
  });

  it('相同输入的摘要稳定（键顺序无关）', async () => {
    const { service, txValues } = createService({});
    const reordered: TeamMessageRelevanceInput = {
      message: {
        refs: TEAM_INPUT.message.refs,
        content: TEAM_INPUT.message.content,
        kind: TEAM_INPUT.message.kind,
        fromRole: TEAM_INPUT.message.fromRole,
      },
      recipient: TEAM_INPUT.recipient,
    };
    const base = {
      kind: 'team.message_relevance' as const,
      tenantId: TENANT_ID,
      subject: { type: 'team_message' as const, id: SUBJECT_ID },
    };

    await service.decide({ ...base, input: TEAM_INPUT });
    await service.decide({ ...base, input: reordered });

    const digests = txValues.mock.calls.map(
      (call) => (call as unknown as [{ inputDigest: string }])[0].inputDigest,
    );
    expect(digests[0]).toBe(digests[1]);
  });

  it('配置 Key 时异步写 Jev 影子记录（原始连接、显式 tenant_id）', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        model: 'jev-1.13.0',
        answers: {
          answer: {
            type: 'choice',
            choice: 'model-a',
            probabilities: { 'model-a': 0.7, 'model-b': 0.3 },
            confidence: 0.64,
          },
        },
        usage: { input_tokens: 200, output_tokens: 4 },
      }),
    );
    const { service, rawValues } = createService({
      APP_TYPESAFE_API_KEY: 'ts-key',
      APP_TYPESAFE_MODEL: 'jev-1.13.0',
    });

    const result = await service.decide({
      kind: 'routing.model_choice',
      tenantId: TENANT_ID,
      subject: { type: 'routing_decision', id: SUBJECT_ID },
      input: {
        queryText: 'write code',
        taskCategory: 'code',
        inputTokenCount: 10,
        candidates: [
          {
            id: 'model-a',
            name: 'gpt-4o',
            provider: 'openai',
            qualityRank: 1,
            avgLatencyMs: 500,
            costs: { input: 0.001, output: 0.002 },
          },
          {
            id: 'model-b',
            name: 'claude',
            provider: 'anthropic',
            qualityRank: 2,
            avgLatencyMs: 400,
            costs: { input: 0.003, output: 0.015 },
          },
        ],
        selectedModelId: 'model-b',
      },
    });
    await service.drainShadows();

    expect(result.outcome).toMatchObject({ type: 'choice', choice: 'model-b' });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.questions.answer).toMatchObject({
      type: 'choice',
      criteria: {
        'model-a': expect.stringContaining('gpt-4o'),
        'model-b': expect.stringContaining('claude'),
      },
    });
    expect(rawValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        kind: 'routing.model_choice',
        subjectType: 'routing_decision',
        subjectId: SUBJECT_ID,
        provider: 'jev',
        mode: 'shadow',
        model: 'jev-1.13.0',
        outcome: {
          type: 'choice',
          choice: 'model-a',
          probabilities: { 'model-a': 0.7, 'model-b': 0.3 },
          confidence: 0.64,
        },
        confidence: 0.64,
        inputTokens: 200,
        outputTokens: 4,
      }),
    );
  });

  it('Jev 失败时影子记录写 error，decide 不抛', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'invalid key' }));
    const { service, rawValues } = createService({
      APP_TYPESAFE_API_KEY: 'bad-key',
    });

    const result = await service.decide({
      kind: 'team.message_relevance',
      tenantId: TENANT_ID,
      subject: { type: 'team_message', id: SUBJECT_ID },
      input: TEAM_INPUT,
    });
    await service.drainShadows();

    expect(result.recordId).toBe('primary-record-1');
    expect(rawValues).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'jev',
        mode: 'shadow',
        error: expect.stringContaining('Jev HTTP 401'),
      }),
    );
    const shadow = (
      rawValues.mock.calls[0] as unknown as [{ outcome?: unknown }]
    )[0];
    expect(shadow.outcome).toBeUndefined();
  });

  it('Jev 回答类型与定义不符时记 error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        model: 'jev-1.13.0',
        answers: { answer: { type: 'score', score: 3 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    const { service, rawValues } = createService({
      APP_TYPESAFE_API_KEY: 'ts-key',
    });

    await service.decide({
      kind: 'team.message_relevance',
      tenantId: TENANT_ID,
      subject: { type: 'team_message', id: SUBJECT_ID },
      input: TEAM_INPUT,
    });
    await service.drainShadows();

    expect(rawValues).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'shadow',
        error: expect.stringContaining('期望 noul'),
      }),
    );
  });

  it('影子记录落库失败只记日志，不抛', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { service, rawValues } = createService({
      APP_TYPESAFE_API_KEY: 'ts-key',
    });
    rawValues.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.decide({
        kind: 'team.message_relevance',
        tenantId: TENANT_ID,
        subject: { type: 'team_message', id: SUBJECT_ID },
        input: TEAM_INPUT,
      }),
    ).resolves.toMatchObject({ recordId: 'primary-record-1' });
    await expect(service.drainShadows()).resolves.toBeUndefined();
  });
});
