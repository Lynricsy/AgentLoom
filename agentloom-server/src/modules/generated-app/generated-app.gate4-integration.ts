// Gate 4 集成（ADR-0007 §4）：不执行工作流，只在租户数据上复核 Gate 0 固定的绑定——
// 目标仍已发布、固定版本仍存在且仍是当前发布版本、映射仍与快照兼容、创建者仍有执行权限、
// Agent 引用的模型配置仍可用。Agent 绑定在这里创建并发布包装工作流（走工作流发布校验链）：
// Gate 5 的验收提交就经由它执行，不能等到 Gate 7 才创建；Gate 7 再次调用时幂等返回同一版本。

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DomainException } from '../../common/exceptions/domain.exception';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import {
  organizationMembers,
  organizations,
} from '../../database/schema/organizations.schema';
import { GENERATED_APP_RUNTIME_BINDING_ADAPTER } from './generated-app.v2-tokens';
import {
  disabledGate,
  failedGate,
  gateEvidence,
  resolveGateExecutionLevel,
} from './generated-app.gate-v2.util';
import { GENERATED_APP_BINDING_RESOLVER } from './generated-app.v2-tokens';
import type {
  GeneratedAppBindingResolver,
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
  GeneratedAppRuntimeBindingAdapter,
} from './types/generation-v2.ports';
import type {
  GeneratedAppGateExecutionLevel,
  GeneratedAppIntegrationPlanV2,
} from './types/generation-plan-v2.types';

type Check = GeneratedAppIntegrationPlanV2['checks'][number] & {
  failureCode: 'binding-drifted' | 'binding-unavailable';
};

/** llm-model 节点上引用模型配置的键（与 Agent 编译时读取的键一致） */
const MODEL_CONFIG_KEYS = [
  'llmConfigId',
  'llm_config_id',
  'modelConfigId',
  'model_config_id',
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class GeneratedAppGate4IntegrationRunner {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    @Inject(GENERATED_APP_BINDING_RESOLVER)
    private readonly bindingResolver: GeneratedAppBindingResolver,
    @Inject(GENERATED_APP_RUNTIME_BINDING_ADAPTER)
    private readonly bindingAdapter: Pick<
      GeneratedAppRuntimeBindingAdapter,
      'ensureRuntimeWorkflow'
    >,
  ) {}

  getExecutionLevel(): GeneratedAppGateExecutionLevel {
    return resolveGateExecutionLevel(
      this.configService,
      'GENERATED_APP_GATE4_EXECUTOR_MODE',
    );
  }

  /** 调用方负责把本方法放进租户事务（短读；Agent 绑定另有一次包装工作流发布） */
  async run(
    context: GeneratedAppGateContextV2,
  ): Promise<GeneratedAppGateEvaluationV2<GeneratedAppIntegrationPlanV2>> {
    const executionLevel = this.getExecutionLevel();
    if (executionLevel === 'disabled') {
      return disabledGate({
        gateId: 'gate-4',
        gateLabel: 'Gate 4 集成',
        envKey: 'GENERATED_APP_GATE4_EXECUTOR_MODE',
        plan: { executionLevel, checks: [] },
      });
    }
    if (executionLevel === 'fixture') {
      return {
        status: 'passed',
        summary:
          'Gate 4 fixture：未复核租户数据，只能用于单测，Gate 6 不会放行。',
        evidence: [
          gateEvidence({
            id: 'gate-4-fixture',
            label: 'Gate 4 fixture',
            kind: 'test',
            summary: 'executionLevel=fixture；executed=false。',
            details: { executionLevel, executed: false },
          }),
        ],
        failure: null,
        repairInstructions: null,
        plan: { executionLevel, checks: [] },
      };
    }

    const checks = [
      ...(await this.checkPinnedTarget(context)),
      ...(await this.checkResolver(context)),
      await this.checkCreatorRole(context),
    ];
    // 绑定已不可用时不创建包装工作流，避免为注定失败的运行留下已发布工作流
    if (checks.every((check) => check.passed)) {
      checks.push(...(await this.checkAgentWrapper(context)));
    }
    const plan: GeneratedAppIntegrationPlanV2 = {
      executionLevel,
      checks: checks.map(({ check, passed, detail }) => ({
        check,
        passed,
        detail,
      })),
    };
    const failed = checks.filter((check) => !check.passed);
    const evidence = [
      gateEvidence({
        id: 'gate-4-binding-recheck',
        label: '绑定复核',
        kind: 'test',
        summary: `${checks.length} 项复核，${failed.length} 项不通过。`,
        details: { executed: true, checks: plan.checks },
      }),
    ];

    if (failed.length > 0) {
      const code = failed.some(
        (check) => check.failureCode === 'binding-unavailable',
      )
        ? 'binding-unavailable'
        : 'binding-drifted';
      return failedGate({
        summary: `Gate 4 失败：绑定复核 ${failed.length} 项不通过（${code}）。`,
        code,
        message: failed.map((check) => check.detail).join('；'),
        details: { failedChecks: plan.checks.filter((check) => !check.passed) },
        evidence,
        repairInstructions:
          code === 'binding-drifted'
            ? '绑定目标在生成过程中重新发布或改了契约；带 regenerateAppSpec: true 重新生成以固定新版本。'
            : '绑定目标已归档、未发布，或创建者已无执行权限、模型配置不可用；恢复后重新运行生成。',
        plan,
      });
    }

    return {
      status: 'passed',
      summary: `Gate 4 通过：${checks.length} 项绑定复核全部通过。`,
      evidence,
      failure: null,
      repairInstructions: null,
      plan,
    };
  }

  private async checkPinnedTarget(
    context: GeneratedAppGateContextV2,
  ): Promise<Check[]> {
    const tenantDb = getTenantDb(this.db);
    const binding = context.appSpec.binding;

    if (binding.kind === 'workflow') {
      const [definition] = await tenantDb
        .select({
          status: schema.workflowDefinitions.status,
          publishedVersionId: schema.workflowDefinitions.publishedVersionId,
        })
        .from(schema.workflowDefinitions)
        .where(
          and(
            eq(schema.workflowDefinitions.id, binding.workflowDefinitionId),
            eq(schema.workflowDefinitions.tenantId, context.tenantId),
          ),
        )
        .limit(1);
      const [version] = await tenantDb
        .select({ id: schema.workflowVersions.id })
        .from(schema.workflowVersions)
        .where(
          and(
            eq(schema.workflowVersions.id, binding.workflowVersionId),
            eq(
              schema.workflowVersions.workflowDefinitionId,
              binding.workflowDefinitionId,
            ),
            eq(schema.workflowVersions.tenantId, context.tenantId),
          ),
        )
        .limit(1);
      return [
        {
          check: 'target-published',
          passed: definition?.status === 'published',
          detail: definition
            ? `工作流状态 ${definition.status}`
            : `工作流 ${binding.workflowDefinitionId} 不存在`,
          failureCode: 'binding-unavailable',
        },
        {
          check: 'pinned-version-exists',
          passed: version !== undefined,
          detail: version
            ? `固定版本 ${binding.workflowVersionId} 存在`
            : `固定版本 ${binding.workflowVersionId} 已不存在`,
          failureCode: 'binding-unavailable',
        },
        {
          check: 'pinned-version-current',
          passed: definition?.publishedVersionId === binding.workflowVersionId,
          detail:
            definition?.publishedVersionId === binding.workflowVersionId
              ? '固定版本仍是当前发布版本'
              : `当前发布版本 ${definition?.publishedVersionId ?? '无'} 与固定版本 ${binding.workflowVersionId} 不一致`,
          failureCode: 'binding-drifted',
        },
      ];
    }

    const [definition] = await tenantDb
      .select({
        status: schema.agentDefinitions.status,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
      })
      .from(schema.agentDefinitions)
      .where(
        and(
          eq(schema.agentDefinitions.id, binding.agentDefinitionId),
          eq(schema.agentDefinitions.tenantId, context.tenantId),
        ),
      )
      .limit(1);
    const [version] = await tenantDb
      .select({ snapshot: schema.agentVersions.snapshot })
      .from(schema.agentVersions)
      .where(
        and(
          eq(schema.agentVersions.id, binding.agentVersionId),
          eq(schema.agentVersions.agentDefinitionId, binding.agentDefinitionId),
          eq(schema.agentVersions.tenantId, context.tenantId),
        ),
      )
      .limit(1);
    const checks: Check[] = [
      {
        check: 'target-published',
        passed: definition?.status === 'published',
        detail: definition
          ? `Agent 状态 ${definition.status}`
          : `Agent ${binding.agentDefinitionId} 不存在`,
        failureCode: 'binding-unavailable',
      },
      {
        check: 'pinned-version-exists',
        passed: version !== undefined,
        detail: version
          ? `固定版本 ${binding.agentVersionId} 存在`
          : `固定版本 ${binding.agentVersionId} 已不存在`,
        failureCode: 'binding-unavailable',
      },
      {
        check: 'pinned-version-current',
        passed: definition?.publishedVersionId === binding.agentVersionId,
        detail:
          definition?.publishedVersionId === binding.agentVersionId
            ? '固定版本仍是当前发布版本'
            : `当前发布版本 ${definition?.publishedVersionId ?? '无'} 与固定版本 ${binding.agentVersionId} 不一致`,
        failureCode: 'binding-drifted',
      },
    ];

    const modelConfigIds = [
      ...new Set(
        (version?.snapshot.nodes ?? [])
          .filter((node) => node.type === 'llm-model')
          .flatMap((node) => {
            const data = (node.data ?? {}) as Record<string, unknown>;
            return MODEL_CONFIG_KEYS.map((key) => data[key]).filter(
              (value): value is string =>
                typeof value === 'string' && UUID_PATTERN.test(value),
            );
          }),
      ),
    ];
    if (modelConfigIds.length > 0) {
      const enabled = await tenantDb
        .select({ id: schema.llmModelConfigs.id })
        .from(schema.llmModelConfigs)
        .where(
          and(
            inArray(schema.llmModelConfigs.id, modelConfigIds),
            eq(schema.llmModelConfigs.tenantId, context.tenantId),
            eq(schema.llmModelConfigs.isEnabled, true),
          ),
        );
      const enabledIds = new Set(enabled.map((row) => row.id));
      const missing = modelConfigIds.filter((id) => !enabledIds.has(id));
      checks.push({
        check: 'agent-model-configs-available',
        passed: missing.length === 0,
        detail:
          missing.length === 0
            ? `Agent 引用的 ${modelConfigIds.length} 个模型配置均可用`
            : `模型配置 ${missing.join('、')} 不存在或已停用`,
        failureCode: 'binding-unavailable',
      });
    }
    return checks;
  }

  private async checkResolver(
    context: GeneratedAppGateContextV2,
  ): Promise<Check[]> {
    const resolution = await this.bindingResolver.resolve(
      context.tenantId,
      context.appSpec,
    );
    if (resolution.ok) {
      return [
        {
          check: 'mapping-compatible',
          passed: true,
          detail: '输入/输出映射仍与当前快照兼容',
          failureCode: 'binding-drifted',
        },
      ];
    }
    return resolution.issues.map((issue, index) => ({
      check: `mapping-compatible:${index}`,
      passed: false,
      detail: issue.message,
      failureCode: 'binding-drifted' as const,
    }));
  }

  private async checkCreatorRole(
    context: GeneratedAppGateContextV2,
  ): Promise<Check> {
    // organization_members 不按 app.current_tenant 隔离，与 RBAC 守卫一致走全局连接按租户过滤
    const [membership] = await this.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(organizations.tenantId, context.tenantId),
          eq(organizationMembers.userId, context.userId),
        ),
      )
      .limit(1);
    const role = membership?.role ?? null;
    const passed = role !== null && role !== 'viewer';
    return {
      check: 'creator-can-execute',
      passed,
      detail: passed
        ? `创建者角色 ${role}`
        : role === null
          ? '创建者已不是该租户成员'
          : '创建者角色为 viewer，无权执行工作流',
      failureCode: 'binding-unavailable',
    };
  }

  private async checkAgentWrapper(
    context: GeneratedAppGateContextV2,
  ): Promise<Check[]> {
    if (context.appSpec.binding.kind !== 'agent') return [];
    try {
      const runtime = await this.bindingAdapter.ensureRuntimeWorkflow({
        tenantId: context.tenantId,
        userId: context.userId,
        appId: context.appId,
        appSpec: context.appSpec,
        generationRunId: context.generationRunId,
      });
      return [
        {
          check: 'agent-wrapper-published',
          passed: true,
          detail: `包装工作流 ${runtime.workflowDefinitionId} 已通过发布校验并发布版本 ${runtime.workflowVersionId}`,
          failureCode: 'binding-unavailable',
        },
      ];
    } catch (error) {
      if (!(error instanceof DomainException)) throw error;
      return [
        {
          check: 'agent-wrapper-published',
          passed: false,
          detail: `包装工作流未通过发布校验：${error.detail}${error.errors?.length ? `（${error.errors.map((item) => item.message).join('；')}）` : ''}`,
          failureCode: 'binding-unavailable',
        },
      ];
    }
  }
}
