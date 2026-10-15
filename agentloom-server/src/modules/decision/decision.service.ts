/**
 * 可替换决策服务：规则结果为主结果（写 mode='primary' 并返回），
 * 配置了 Jev 且定义开启影子时异步跑 Jev 并写 mode='shadow'，影子绝不影响主流程。
 */
import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  decisionRecords,
  type DecisionRecord,
  type NewDecisionRecord,
} from '../../database/schema';
import { DECISION_DEFINITIONS } from './definitions';
import type {
  DecisionDefinition,
  DecisionInputByKind,
  DecisionKind,
  DecisionOutcome,
  DecisionRequest,
  DecisionResult,
  DecisionSubjectType,
} from './decision.types';
import type {
  DecisionRecordListResponse,
  DecisionRecordResponse,
  ListDecisionRecordsQueryDto,
} from './dto/decision-record.dto';
import { JevDecisionProvider } from './providers/jev-decision.provider';
import { RuleDecisionProvider } from './providers/rule-decision.provider';

const SHADOW_ERROR_MAX_CHARS = 500;

@Injectable()
export class DecisionService implements OnApplicationShutdown {
  private readonly logger = new Logger(DecisionService.name);
  private readonly shadowTimeoutMs: number;
  /** 进行中的影子评估；停机时等待其落库 */
  private readonly pendingShadows = new Set<Promise<void>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ruleProvider: RuleDecisionProvider,
    private readonly jevProvider: JevDecisionProvider,
    configService: ConfigService,
  ) {
    this.shadowTimeoutMs =
      configService.get<number>('APP_TYPESAFE_TIMEOUT_MS') ?? 3000;
  }

  async decide<K extends DecisionKind>(
    req: DecisionRequest<DecisionInputByKind[K]> & { kind: K },
  ): Promise<DecisionResult> {
    const def = DECISION_DEFINITIONS[req.kind] as DecisionDefinition<
      DecisionInputByKind[K]
    >;
    const inputDigest = createHash('sha256')
      .update(canonicalJson(def.buildState(req.input)))
      .digest('hex');
    const startedAt = performance.now();
    const { outcome } = await this.ruleProvider.evaluate(def, req.input);
    const latencyMs = Math.round(performance.now() - startedAt);
    const baseRecord = {
      tenantId: req.tenantId,
      kind: req.kind,
      subjectType: req.subject.type,
      subjectId: req.subject.id,
      definitionVersion: def.version,
      inputDigest,
    } satisfies Partial<NewDecisionRecord>;

    const [inserted] = await runInTenantTransaction(
      this.db,
      req.tenantId,
      (tx) =>
        tx
          .insert(decisionRecords)
          .values({
            ...baseRecord,
            provider: 'rule',
            mode: 'primary',
            outcome,
            confidence: outcome.type === 'choice' ? outcome.confidence : null,
            latencyMs,
          })
          .returning({ id: decisionRecords.id }),
    );

    if (def.shadow && this.jevProvider.enabled) {
      const shadow = this.runShadow(def, req.input, baseRecord).finally(() => {
        this.pendingShadows.delete(shadow);
      });
      this.pendingShadows.add(shadow);
    }

    return { outcome, recordId: inserted.id };
  }

  /** 等待当前全部影子评估落库 */
  async drainShadows(): Promise<void> {
    await Promise.all(this.pendingShadows);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.drainShadows();
  }

  async listRecords(
    tenantId: string,
    query: ListDecisionRecordsQueryDto,
  ): Promise<DecisionRecordListResponse> {
    const conditions: SQL[] = [];
    if (query.kind) conditions.push(eq(decisionRecords.kind, query.kind));
    if (query.subjectType) {
      conditions.push(eq(decisionRecords.subjectType, query.subjectType));
    }
    if (query.subjectId) {
      conditions.push(eq(decisionRecords.subjectId, query.subjectId));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(decisionRecords)
        .where(where)
        .orderBy(desc(decisionRecords.createdAt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);
      const [{ total }] = await tx
        .select({ total: count() })
        .from(decisionRecords)
        .where(where);

      return {
        data: rows.map(serializeDecisionRecord),
        meta: {
          total,
          page: query.page,
          limit: query.limit,
          pageSize: query.limit,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    });
  }

  /**
   * 影子评估：Jev 结果或错误都写 mode='shadow'，绝不抛出。
   * 用不切换角色的原始连接（RLS 不生效）并显式写 tenant_id：影子在请求事务结束后才完成。
   */
  private async runShadow<I>(
    def: DecisionDefinition<I>,
    input: I,
    baseRecord: Omit<
      NewDecisionRecord,
      'provider' | 'mode' | 'latencyMs' | 'id' | 'createdAt'
    >,
  ): Promise<void> {
    const startedAt = performance.now();
    let record: NewDecisionRecord;

    try {
      const evaluation = await this.jevProvider.evaluate(
        def,
        input,
        AbortSignal.timeout(this.shadowTimeoutMs),
      );
      record = {
        ...baseRecord,
        provider: 'jev',
        mode: 'shadow',
        model: evaluation.model ?? null,
        outcome: evaluation.outcome,
        confidence:
          evaluation.outcome.type === 'choice'
            ? evaluation.outcome.confidence
            : null,
        latencyMs: Math.round(performance.now() - startedAt),
        inputTokens: evaluation.usage?.inputTokens ?? null,
        outputTokens: evaluation.usage?.outputTokens ?? null,
      };
    } catch (error) {
      record = {
        ...baseRecord,
        provider: 'jev',
        mode: 'shadow',
        latencyMs: Math.round(performance.now() - startedAt),
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          SHADOW_ERROR_MAX_CHARS,
        ),
      };
    }

    try {
      await this.db.insert(decisionRecords).values(record);
    } catch (error) {
      this.logger.warn(
        `写入 ${def.kind} 影子决策记录失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function serializeDecisionRecord(row: DecisionRecord): DecisionRecordResponse {
  return {
    id: row.id,
    kind: row.kind as DecisionKind,
    subjectType: row.subjectType as DecisionSubjectType,
    subjectId: row.subjectId,
    provider: row.provider,
    model: row.model,
    mode: row.mode,
    definitionVersion: row.definitionVersion,
    outcome: row.outcome as DecisionOutcome | null,
    confidence: row.confidence,
    latencyMs: row.latencyMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 键排序后的 JSON，用于给决策输入计算稳定摘要 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((field) => record[field] !== undefined)
      .sort()
      .map((field) => `${JSON.stringify(field)}:${canonicalJson(record[field])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
