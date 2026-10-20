// Gate 3 构建与单元（ADR-0007 §4）：把 AppSpec v2 物化为工作区文件（app-spec.ts、runtime-form.ts、
// static-contracts.ts、contract 报告与 manifest），写入对象存储本次运行的 gate-3 前缀；
// 并对每个 requirement 场景跑 contract 测试——步骤值经公开提交校验、
// 投影后的 inputParams 经工作流 inputSchema 校验（与公开提交、runWorkflow 同一套实现）；
// 另加未知字段、缺必填字段两类反例，确认校验确实拒绝。
// 生成队列由 server 与 worker 共同消费，工作区不落执行进程的本地磁盘，
// 否则另一个进程读不到、容器重启即丢失（D-176）。

import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StorageService } from '../../infrastructure/storage/storage.service';
import type { WorkflowInputSchema } from '../workflow/dto/workflow-input-schema.dto';
import { validateSubmissionAgainstWorkflowInputSchema } from './generated-app-public-submission.util';
import { buildGeneratedAppRunGatePrefix } from './generated-app.internal';
import {
  disabledGate,
  failedGate,
  gateEvidence,
  resolveGateExecutionLevel,
} from './generated-app.gate-v2.util';
import {
  GENERATED_APP_AGENT_WRAPPER_BUILDER,
  GENERATED_APP_RUNTIME_BINDING_ADAPTER,
  GENERATED_APP_RUNTIME_FORM_BUILDER,
  type GeneratedAppAgentWrapperBuilder,
} from './generated-app.v2-tokens';
import type {
  GeneratedAppAcceptanceScenarioV2,
  GeneratedAppSpecV2,
} from './types/app-spec-v2.schema';
import type {
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
  GeneratedAppRuntimeBindingAdapter,
  GeneratedAppRuntimeFormBuilder,
} from './types/generation-v2.ports';
import type {
  GeneratedAppBuildUnitPlanV2,
  GeneratedAppContractCaseResult,
  GeneratedAppGateExecutionLevel,
  GeneratedAppWorkspaceFile,
} from './types/generation-plan-v2.types';

type SubmissionValues = Record<string, string | number | string[]>;

/** 场景步骤里填写/选择的值，按字段类型转成公开提交 JSON 的形状 */
export function buildScenarioSubmission(
  appSpec: GeneratedAppSpecV2,
  scenario: GeneratedAppAcceptanceScenarioV2,
): SubmissionValues {
  const fields = new Map(
    appSpec.inputForm.fields.map((field) => [field.id, field]),
  );
  const values: SubmissionValues = {};
  for (const step of scenario.browserSteps) {
    const field = fields.get('fieldId' in step ? step.fieldId : '');
    if (!field) continue;
    if (step.action === 'fill') {
      values[field.id] =
        field.type === 'number' ? Number(step.value) : step.value;
    } else if (step.action === 'select') {
      values[field.id] =
        field.type === 'multi_select' ? [...step.values] : step.values[0];
    }
  }
  return values;
}

const WORKSPACE_CONTENT_TYPES: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html',
};

export function resolveWorkspaceFileContentType(path: string): string {
  return (
    WORKSPACE_CONTENT_TYPES[path.slice(path.lastIndexOf('.'))] ?? 'text/plain'
  );
}

/** 工作区在对象存储中的前缀：与 Gate 5 证据同属应用根前缀，删除应用时一并清理 */
export function buildGate3WorkspacePrefix(params: {
  tenantId: string;
  appId: string;
  generationRunId: string;
}): string {
  return buildGeneratedAppRunGatePrefix(
    params.tenantId,
    params.appId,
    params.generationRunId,
    'gate-3',
  );
}

@Injectable()
export class GeneratedAppGate3WorkspaceRunner {
  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    @Inject(GENERATED_APP_RUNTIME_FORM_BUILDER)
    private readonly formBuilder: GeneratedAppRuntimeFormBuilder,
    @Inject(GENERATED_APP_RUNTIME_BINDING_ADAPTER)
    private readonly bindingAdapter: Pick<
      GeneratedAppRuntimeBindingAdapter,
      'mapSubmission'
    >,
    @Inject(GENERATED_APP_AGENT_WRAPPER_BUILDER)
    private readonly wrapperBuilder: GeneratedAppAgentWrapperBuilder,
  ) {}

  getExecutionLevel(): GeneratedAppGateExecutionLevel {
    return resolveGateExecutionLevel(
      this.configService,
      'GENERATED_APP_GATE3_EXECUTOR_MODE',
    );
  }

  async run(
    context: GeneratedAppGateContextV2,
  ): Promise<GeneratedAppGateEvaluationV2<GeneratedAppBuildUnitPlanV2>> {
    const executionLevel = this.getExecutionLevel();
    if (executionLevel === 'disabled') {
      return disabledGate({
        gateId: 'gate-3',
        gateLabel: 'Gate 3 构建与单元',
        envKey: 'GENERATED_APP_GATE3_EXECUTOR_MODE',
        plan: { executionLevel, workspace: null, contractCases: [] },
      });
    }
    if (executionLevel === 'fixture') {
      return {
        status: 'passed',
        summary:
          'Gate 3 fixture：未物化工作区、未执行 contract 测试，只能用于单测，Gate 6 不会放行。',
        evidence: [
          gateEvidence({
            id: 'gate-3-fixture',
            label: 'Gate 3 fixture',
            kind: 'build',
            summary: 'executionLevel=fixture；executed=false。',
            details: { executionLevel, executed: false },
          }),
        ],
        failure: null,
        repairInstructions: null,
        plan: { executionLevel, workspace: null, contractCases: [] },
      };
    }

    const contractCases = this.runContractCases(context);
    const relativePath = buildGate3WorkspacePrefix(context);
    let files: GeneratedAppWorkspaceFile[];
    try {
      files = await this.persistWorkspace(relativePath, context, contractCases);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failedGate({
        summary: 'Gate 3 失败：工作区写入对象存储失败。',
        code: 'gate-3-workspace-materialization-failed',
        message: `工作区物化失败：${message}`,
        details: { workspaceRef: relativePath },
        evidence: [
          gateEvidence({
            id: 'gate-3-workspace-materialization',
            label: '工作区物化',
            kind: 'build',
            summary: message,
            details: { executed: false, workspaceRef: relativePath },
          }),
        ],
        repairInstructions:
          '检查对象存储（APP_MINIO_*）是否可用、存储桶是否可写，然后重新运行生成。',
        plan: { executionLevel, workspace: null, contractCases },
      });
    }

    const plan: GeneratedAppBuildUnitPlanV2 = {
      executionLevel,
      workspace: { relativePath, files },
      contractCases,
    };
    const failedCases = contractCases.filter((item) => !item.passed);
    const evidence = [
      gateEvidence({
        id: 'gate-3-workspace',
        label: '工作区物化',
        kind: 'build',
        summary: `已物化 ${files.length} 个文件到对象存储 ${relativePath}/。`,
        details: { executed: true, workspaceRef: relativePath, files },
      }),
      gateEvidence({
        id: 'gate-3-contract-tests',
        label: 'contract 测试',
        kind: 'test',
        summary: `${contractCases.length} 个用例，${failedCases.length} 个失败。`,
        details: { executed: true, contractCases },
      }),
    ];

    if (failedCases.length > 0) {
      return failedGate({
        summary: `Gate 3 失败：${failedCases.length} 个 contract 用例未通过。`,
        code: 'gate-3-command-failed',
        message: failedCases
          .map((item) => `${item.caseId}：${item.detail}`)
          .join('；'),
        details: { failedCases },
        evidence,
        repairInstructions:
          '验收场景的填写值与表单或工作流 inputSchema 不一致；带 regenerateAppSpec: true 重新生成。',
        plan,
      });
    }

    return {
      status: 'passed',
      summary: `Gate 3 通过：工作区已物化，${contractCases.length} 个 contract 用例全部通过。`,
      evidence,
      failure: null,
      repairInstructions: null,
      plan,
    };
  }

  private resolveProjectionSchema(context: GeneratedAppGateContextV2): {
    inputSchema: WorkflowInputSchema | null;
    runtime: {
      workflowDefinitionId: string;
      workflowVersionId: string;
      inputSchemaVersion: number | undefined;
    };
  } {
    if (context.resolvedBinding.kind === 'workflow') {
      const candidate = context.resolvedBinding.candidate;
      return {
        inputSchema: candidate.inputSchema,
        runtime: {
          workflowDefinitionId: candidate.workflowDefinitionId,
          workflowVersionId: candidate.workflowVersionId,
          inputSchemaVersion: candidate.inputSchema?.version,
        },
      };
    }
    // Agent 绑定的包装工作流在 Gate 7 才创建；这里按同一构建函数生成的 inputSchema 做投影校验，
    // 运行时 id 只用于构造请求对象，不会被执行。
    const wrapper = this.wrapperBuilder.buildAgentWrapperWorkflowGraph(
      context.appSpec,
      { appId: context.appId },
    );
    return {
      inputSchema: wrapper.inputSchema,
      runtime: {
        workflowDefinitionId:
          context.resolvedBinding.candidate.agentDefinitionId,
        workflowVersionId: context.resolvedBinding.candidate.agentVersionId,
        inputSchemaVersion: wrapper.inputSchema.version,
      },
    };
  }

  private runContractCases(
    context: GeneratedAppGateContextV2,
  ): GeneratedAppContractCaseResult[] {
    const { appSpec } = context;
    const { inputSchema, runtime } = this.resolveProjectionSchema(context);
    const cases: GeneratedAppContractCaseResult[] = [];

    const requirementScenarios = appSpec.acceptanceScenarios.filter(
      (scenario) => scenario.scope === 'requirement',
    );
    for (const scenario of requirementScenarios) {
      const submission = buildScenarioSubmission(appSpec, scenario);
      const validation = this.formBuilder.validateSubmission(
        appSpec,
        submission,
      );
      if (!validation.ok) {
        cases.push({
          caseId: `${scenario.id}:submission`,
          scenarioId: scenario.id,
          kind: 'scenario-submission',
          passed: false,
          detail: `公开提交校验拒绝：${validation.errors
            .map((error) => `${error.field} ${error.message}`)
            .join('，')}`,
        });
        continue;
      }
      const request = this.bindingAdapter.mapSubmission(
        appSpec,
        runtime,
        validation.values,
      );
      const projectionErrors = inputSchema
        ? validateSubmissionAgainstWorkflowInputSchema({
            workflowInputSchema: inputSchema,
            input: request.inputParams,
          }).errors
        : [];
      cases.push({
        caseId: `${scenario.id}:submission`,
        scenarioId: scenario.id,
        kind: 'scenario-submission',
        passed: projectionErrors.length === 0,
        detail:
          projectionErrors.length === 0
            ? `提交 ${JSON.stringify(submission).slice(0, 200)} 投影为 inputParams 键 ${Object.keys(request.inputParams).join('、')}`
            : `投影后的 inputParams 不满足工作流 inputSchema：${projectionErrors
                .map((error) => `${error.field} ${error.message}`)
                .join('，')}`,
      });
    }

    const sample = requirementScenarios[0]
      ? buildScenarioSubmission(appSpec, requirementScenarios[0])
      : {};
    const unknownKey = 'gate3UnknownField';
    const unknown = this.formBuilder.validateSubmission(appSpec, {
      ...sample,
      [unknownKey]: 'x',
    });
    cases.push({
      caseId: 'reject-unknown-field',
      scenarioId: null,
      kind: 'reject-unknown-field',
      passed: !unknown.ok,
      detail: unknown.ok
        ? `未声明字段 ${unknownKey} 被接受`
        : '未声明字段被拒绝',
    });
    for (const field of appSpec.inputForm.fields.filter(
      (item) => item.required,
    )) {
      const { [field.id]: _omitted, ...rest } = sample;
      const missing = this.formBuilder.validateSubmission(appSpec, rest);
      cases.push({
        caseId: `reject-missing-required:${field.id}`,
        scenarioId: null,
        kind: 'reject-missing-required',
        passed: !missing.ok,
        detail: missing.ok
          ? `缺少必填字段 ${field.id} 的提交被接受`
          : `缺少必填字段 ${field.id} 被拒绝`,
      });
    }
    return cases;
  }

  private async persistWorkspace(
    prefix: string,
    context: GeneratedAppGateContextV2,
    contractCases: GeneratedAppContractCaseResult[],
  ): Promise<GeneratedAppWorkspaceFile[]> {
    const form = this.formBuilder.buildPublicForm(context.appSpec);
    const header = '// 由生成应用 Gate 3 按 AppSpec v2 物化，请勿手改。\n';
    const contents: Array<
      Pick<GeneratedAppWorkspaceFile, 'path' | 'kind'> & { content: string }
    > = [
      {
        path: 'src/generated-app/app-spec.ts',
        kind: 'source',
        content: `${header}export const appSpec = ${JSON.stringify(context.appSpec, null, 2)} as const;\n`,
      },
      {
        path: 'src/generated-app/runtime-form.ts',
        kind: 'source',
        content: `${header}export const runtimeForm = ${JSON.stringify(form, null, 2)} as const;\n`,
      },
      {
        path: 'src/generated-app/static-contracts.ts',
        kind: 'source',
        content: `${header}export const staticContracts = ${JSON.stringify(context.generationPlan.staticContracts ?? null, null, 2)} as const;\n`,
      },
      {
        path: 'artifacts/gate-3/contract-report.json',
        kind: 'report',
        content: `${JSON.stringify({ generationRunId: context.generationRunId, contractCases }, null, 2)}\n`,
      },
    ];
    const describeFile = (
      file: (typeof contents)[number],
    ): GeneratedAppWorkspaceFile => ({
      path: file.path,
      kind: file.kind,
      sha256: createHash('sha256').update(file.content).digest('hex'),
      sizeBytes: Buffer.byteLength(file.content),
    });
    const sourceFiles = contents.map(describeFile);
    contents.push({
      path: 'generated-app.manifest.json',
      kind: 'manifest',
      content: `${JSON.stringify({ generationRunId: context.generationRunId, files: sourceFiles }, null, 2)}\n`,
    });

    await Promise.all(
      contents.map((file) => {
        const body = Buffer.from(file.content, 'utf8');
        return this.storageService.upload(
          `${prefix}/${file.path}`,
          body,
          body.length,
          resolveWorkspaceFileContentType(file.path),
        );
      }),
    );
    return contents.map(describeFile);
  }
}
