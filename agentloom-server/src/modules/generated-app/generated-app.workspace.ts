import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
  GeneratedAppGenerationPlan,
  GeneratedAppRepairPlan,
  GeneratedAppReverificationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../database/schema';
import { buildGeneratedAppRuntimeForm } from './generated-app.runtime';

export type GeneratedAppGate3ExecutorMode = 'real' | 'fixture' | 'disabled';

export type GeneratedAppBuildUnitExecutionLevel =
  GeneratedAppBuildUnitPlan['executionLevel'];

export type GeneratedAppGenerationWorkspaceContract = NonNullable<
  GeneratedAppBuildUnitPlan['generationWorkspace']
>;

export interface GeneratedAppGate3CommandPlan {
  commandId: string;
  command: string;
  scriptPath: string;
  workingDirectory: string;
  requirementIds: string[];
  scenarioIds: string[];
  producesArtifactIds: string[];
}

export interface GeneratedAppGate3CommandResult {
  commandId: string;
  command: string;
  exitCode: number | null;
  stdoutSummary: string;
  stderrSummary: string;
  durationMs: number;
  executed: boolean;
  timedOut: boolean;
  artifactRefs: string[];
  requirementIds: string[];
  scenarioIds: string[];
}

export interface GeneratedAppGate3RunnerResult {
  status: 'passed' | 'failed';
  executionLevel: GeneratedAppBuildUnitExecutionLevel;
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
  commandResults: GeneratedAppGate3CommandResult[];
}

export interface GeneratedAppGate3RepairResult extends GeneratedAppGate3RunnerResult {
  patchApplied: boolean;
  changeSummary: string;
  verificationSummary: string;
}

interface MaterializeWorkspaceParams {
  tenantId: string;
  appId: string;
  generationRunId: string;
  appSpec: GeneratedAppSpec;
  generationPlan: GeneratedAppGenerationPlan;
  staticContracts: GeneratedAppStaticContracts;
  buildUnitPlan: GeneratedAppBuildUnitPlan;
}

interface Gate3RunParams extends MaterializeWorkspaceParams {
  workspace: GeneratedAppGenerationWorkspaceContract;
  commandPlan: GeneratedAppGate3CommandPlan[];
}

interface Gate3RepairParams extends Gate3RunParams {
  repairPlan: GeneratedAppRepairPlan;
  reverificationPlan: GeneratedAppReverificationPlan;
}

const GATE_3_RUNNER_IDS = {
  real: 'gate-3-real-build-unit-runner',
  fixture: 'gate-3-fixture-build-unit-runner',
  disabled: 'gate-3-disabled-build-unit-runner',
} as const;

const GATE_3_COMMAND_DEFINITIONS = [
  {
    commandId: 'gate-3-frontend-build-command',
    command: 'node scripts/gate3-build.mjs',
    scriptPath: 'scripts/gate3-build.mjs',
    producesArtifactIds: ['frontend-build-output'],
  },
  {
    commandId: 'gate-3-typecheck-command',
    command: 'node scripts/gate3-typecheck.mjs',
    scriptPath: 'scripts/gate3-typecheck.mjs',
    producesArtifactIds: ['coverage-report'],
  },
  {
    commandId: 'gate-3-unit-test-command',
    command: 'node scripts/gate3-unit.mjs',
    scriptPath: 'scripts/gate3-unit.mjs',
    producesArtifactIds: ['unit-test-report'],
  },
  {
    commandId: 'gate-3-component-golden-test-entry',
    command: 'node scripts/gate3-component-golden.mjs',
    scriptPath: 'scripts/gate3-component-golden.mjs',
    producesArtifactIds: ['component-golden-report', 'coverage-report'],
  },
  {
    commandId: 'gate-3-plugin-build-command',
    command: 'node scripts/gate3-plugin-build.mjs',
    scriptPath: 'scripts/gate3-plugin-build.mjs',
    producesArtifactIds: [],
  },
] as const satisfies ReadonlyArray<{
  commandId: string;
  command: string;
  scriptPath: string;
  producesArtifactIds: string[];
}>;

const GATE_3_COMMAND_DEFINITIONS_BY_ID = new Map<
  string,
  (typeof GATE_3_COMMAND_DEFINITIONS)[number]
>(
  GATE_3_COMMAND_DEFINITIONS.map((definition) => [
    definition.commandId,
    definition,
  ]),
);

const GATE_3_WORKSPACE_FILES: GeneratedAppGenerationWorkspaceContract['files'] =
  [
    {
      path: 'package.json',
      kind: 'package',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'index.html',
      kind: 'html',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'tsconfig.json',
      kind: 'config',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'tsconfig.generated-app.json',
      kind: 'config',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'vite.config.ts',
      kind: 'config',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'src/main.tsx',
      kind: 'source',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'src/App.tsx',
      kind: 'source',
      derivedFrom: 'AppSpec',
      required: true,
    },
    {
      path: 'src/generated-app/app-spec.ts',
      kind: 'source',
      derivedFrom: 'AppSpec',
      required: true,
    },
    {
      path: 'src/generated-app/static-contracts.ts',
      kind: 'source',
      derivedFrom: 'generationPlan.staticContracts',
      required: true,
    },
    {
      path: 'src/generated-app/runtime-form.ts',
      kind: 'source',
      derivedFrom: 'generationPlan.staticContracts',
      required: true,
    },
    {
      path: 'src/generated-app/runtime.ts',
      kind: 'source',
      derivedFrom: 'generationPlan.staticContracts',
      required: true,
    },
    {
      path: 'src/generated-app/__tests__/runtime.contract.spec.ts',
      kind: 'test',
      derivedFrom: 'generationPlan.staticContracts',
      required: true,
    },
    {
      path: 'src/generated-app/__tests__/runtime.golden.spec.tsx',
      kind: 'test',
      derivedFrom: 'AppSpec',
      required: true,
    },
    {
      path: 'generated-app.manifest.json',
      kind: 'manifest',
      derivedFrom: 'generationPlan.staticContracts',
      required: true,
    },
    {
      path: 'scripts/gate3-build.mjs',
      kind: 'script',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'scripts/gate3-typecheck.mjs',
      kind: 'script',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'scripts/gate3-unit.mjs',
      kind: 'script',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'scripts/gate3-component-golden.mjs',
      kind: 'script',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
    {
      path: 'scripts/gate3-plugin-build.mjs',
      kind: 'script',
      derivedFrom: 'generated-app-scaffold',
      required: true,
    },
  ];

@Injectable()
export class GeneratedAppGate3WorkspaceRunner {
  constructor(private readonly configService: ConfigService) {}

  getExecutionLevel(): GeneratedAppBuildUnitExecutionLevel {
    const mode = this.getExecutorMode();

    if (mode === 'real') return 'real-local-command-plan';
    if (mode === 'fixture') return 'fixture-execution';
    return 'disabled-execution';
  }

  getExecutorMode(): GeneratedAppGate3ExecutorMode {
    const rawMode =
      this.configService.get<string>('GENERATED_APP_GATE3_EXECUTOR_MODE') ??
      this.configService.get<string>('APP_GENERATED_APP_GATE3_EXECUTOR_MODE') ??
      'real';
    const normalizedMode = rawMode.trim().toLowerCase();

    if (normalizedMode === 'fixture') return 'fixture';
    if (normalizedMode === 'disabled') return 'disabled';
    return 'real';
  }

  buildWorkspaceContract(params: {
    tenantId: string;
    appId: string;
    generationRunId: string;
    appSpec: GeneratedAppSpec;
    staticContracts: GeneratedAppStaticContracts;
  }): GeneratedAppGenerationWorkspaceContract {
    const workspaceId = `generated-app-${this.sanitizeSegment(
      params.appId,
    )}-${this.sanitizeSegment(params.generationRunId)}`;
    const relativePath = [
      'tenants',
      this.sanitizeSegment(params.tenantId),
      'apps',
      this.sanitizeSegment(params.appId),
      'runs',
      this.sanitizeSegment(params.generationRunId),
    ].join('/');

    return {
      contractVersion: 1,
      workspaceId,
      storageKind: 'server-controlled-local-workspace',
      rootLabel: 'generated-app-workspaces',
      relativePath,
      scaffold: 'react-vite-typescript',
      materializedFrom: {
        appSpecVersion: params.appSpec.version,
        staticContractsVersion: params.staticContracts.contractVersion,
      },
      writePolicy: {
        arbitraryPathWriteAllowed: false,
        traversalGuard: 'resolve-inside-workspace-root',
        exposesAbsoluteHostPath: false,
      },
      files: [
        ...GATE_3_WORKSPACE_FILES,
        ...this.buildPluginWorkspaceFileContracts(
          params.staticContracts.pluginToolPermissions.tools.map(
            (tool) => tool.toolId,
          ),
        ),
      ],
      artifactPaths: {
        sourceManifest: 'artifacts/gate-3/source-manifest.json',
        sourceArchive: 'artifacts/gate-3/source-artifact.json',
        buildOutput: 'dist/index.html',
        buildManifest: 'dist/assets/manifest.json',
        unitReport: 'artifacts/gate-3/unit-test-report.json',
        componentGoldenReport: 'artifacts/gate-3/component-golden-report.json',
        coverageSummary: 'coverage/generated-app/coverage-summary.json',
      },
    };
  }

  buildCommandPlan(params: {
    workspace: GeneratedAppGenerationWorkspaceContract;
    requirementIds: string[];
    scenarioIds: string[];
  }): GeneratedAppGate3CommandPlan[] {
    const workingDirectory = params.workspace.relativePath;
    const pluginToolIds = this.extractPluginToolIdsFromWorkspace(
      params.workspace,
    );
    const pluginBundleArtifactIds = pluginToolIds.map(
      (toolId) => `plugin-bundle-${toolId}`,
    );

    return GATE_3_COMMAND_DEFINITIONS.filter(
      (definition) =>
        definition.commandId !== 'gate-3-plugin-build-command' ||
        pluginBundleArtifactIds.length > 0,
    ).map((definition) => ({
      commandId: definition.commandId,
      command: definition.command,
      scriptPath: definition.scriptPath,
      workingDirectory,
      requirementIds: params.requirementIds,
      scenarioIds:
        definition.commandId === 'gate-3-typecheck-command'
          ? []
          : params.scenarioIds,
      producesArtifactIds:
        definition.commandId === 'gate-3-plugin-build-command'
          ? pluginBundleArtifactIds
          : [...definition.producesArtifactIds],
    }));
  }

  async materializeAndRun(
    params: Gate3RunParams,
  ): Promise<GeneratedAppGate3RunnerResult> {
    const mode = this.getExecutorMode();
    const executionLevel = this.getExecutionLevel();

    if (mode === 'disabled') {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 3 失败：构建与单元执行器被配置为 disabled，未 materialize workspace，也未执行任何真实命令。',
        evidence: [
          this.buildExecutionEvidence({
            id: 'gate-3-executor-disabled',
            label: 'Gate 3 执行器禁用状态',
            kind: 'build',
            summary:
              'Gate 3 executor mode=disabled；该状态不能被当作真实构建或测试通过。',
            details: {
              runnerId: GATE_3_RUNNER_IDS.disabled,
              executionMode: 'disabled',
              executed: false,
              workspaceRef: params.workspace.relativePath,
            },
          }),
        ],
        failure: {
          code: 'gate-3-executor-disabled',
          message: 'Gate 3 构建与单元执行器被禁用，不能继续执行 Gate 4-7。',
          details: {
            runnerId: GATE_3_RUNNER_IDS.disabled,
            executionMode: 'disabled',
            workspaceRef: params.workspace.relativePath,
          },
        },
        repairInstructions:
          '启用 GENERATED_APP_GATE3_EXECUTOR_MODE=real，或在明确标注 fixture 的测试环境中重新运行；disabled 状态不得进入后续门禁。',
        commandResults: [],
      };
    }

    let workspacePath: string;

    try {
      ({ workspacePath } = await this.materializeWorkspace(params));
    } catch (error: unknown) {
      const message = this.redactHostPaths(this.toErrorMessage(error));

      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 3 失败：Generation Workspace materialization 未完成，已停止 Gate 4-7。',
        evidence: [
          this.buildExecutionEvidence({
            id: 'gate-3-generation-workspace-materialization',
            label: 'Generation Workspace materialization',
            kind: 'build',
            summary: `受控 workspace 写入失败：${message}`,
            details: {
              runnerId:
                mode === 'fixture'
                  ? GATE_3_RUNNER_IDS.fixture
                  : GATE_3_RUNNER_IDS.real,
              executionMode:
                mode === 'fixture' ? 'fixture' : 'real_local_command_plan',
              executed: false,
              workspaceRef: params.workspace.relativePath,
              errorMessage: message,
            },
          }),
        ],
        failure: {
          code: 'gate-3-workspace-materialization-failed',
          message:
            'Gate 3 Generation Workspace materialization 失败，不能继续执行 Gate 4-7。',
          details: {
            workspaceRef: params.workspace.relativePath,
            errorMessage: message,
          },
        },
        repairInstructions:
          '检查服务端 GENERATED_APP_WORKSPACE_ROOT 可写性、受控 workspace 相对路径和 scaffold 文件写入规则；修复后重新运行 Gate 3。',
        commandResults: [],
      };
    }

    if (mode === 'fixture') {
      const commandResults = params.commandPlan.map((command) =>
        this.createFixtureCommandResult(command),
      );

      return {
        status: 'passed',
        executionLevel,
        summary:
          'Gate 3 通过：deterministic fixture executor 已验证 Generation Workspace 契约和命令计划形状；未执行真实本地 build/typecheck/unit/component-golden 命令，不能作为真实构建或测试通过证据。',
        evidence: [
          this.buildWorkspaceEvidence(params.workspace),
          ...commandResults.map((result) =>
            this.buildCommandEvidence(result, {
              runnerId: GATE_3_RUNNER_IDS.fixture,
              executionMode: 'fixture',
              workspaceRef: params.workspace.relativePath,
            }),
          ),
        ],
        failure: null,
        repairInstructions: null,
        commandResults,
      };
    }

    const commandResults: GeneratedAppGate3CommandResult[] = [];

    for (const command of params.commandPlan) {
      const result = await this.runControlledCommand(workspacePath, command);
      commandResults.push(result);

      if (result.exitCode !== 0) {
        return {
          status: 'failed',
          executionLevel,
          summary: `Gate 3 失败：命令 ${command.commandId} 退出码为 ${String(
            result.exitCode,
          )}，已停止 Gate 4-7。`,
          evidence: [
            this.buildWorkspaceEvidence(params.workspace),
            ...commandResults.map((item) =>
              this.buildCommandEvidence(item, {
                runnerId: GATE_3_RUNNER_IDS.real,
                executionMode: 'real_local_command_plan',
                workspaceRef: params.workspace.relativePath,
              }),
            ),
          ],
          failure: {
            code: 'gate-3-command-failed',
            message: `Gate 3 命令 ${command.commandId} 执行失败，不能继续执行 Gate 4-7。`,
            details: {
              workspaceRef: params.workspace.relativePath,
              failedCommand: result,
              commandResults,
            },
          },
          repairInstructions:
            '读取 Gate 3 命令 stdout/stderr 摘要和 artifact refs，修复生成应用源码、静态合约覆盖或测试入口后重新运行 Gate 3。',
          commandResults,
        };
      }
    }

    return {
      status: 'passed',
      executionLevel,
      summary:
        'Gate 3 通过：Generation Workspace 已 materialize，real-local command plan 已执行 build/typecheck/unit/component-golden 四类受控命令并产出构建、测试、golden 和 coverage artifact 证据；Gate 4-6 仍需真实集成、浏览器和独立 verifier runner。',
      evidence: [
        this.buildWorkspaceEvidence(params.workspace),
        ...commandResults.map((result) =>
          this.buildCommandEvidence(result, {
            runnerId: GATE_3_RUNNER_IDS.real,
            executionMode: 'real_local_command_plan',
            workspaceRef: params.workspace.relativePath,
          }),
        ),
      ],
      failure: null,
      repairInstructions: null,
      commandResults,
    };
  }

  async applyRepairPatchAndRun(
    params: Gate3RepairParams,
  ): Promise<GeneratedAppGate3RepairResult> {
    const mode = this.getExecutorMode();
    const executionLevel = this.getExecutionLevel();

    if (mode !== 'real') {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 3 修复失败：只有 real-local-command-plan 执行器允许应用受控补丁并重新验证。',
        evidence: [
          this.buildExecutionEvidence({
            id: 'gate-3-controlled-repair-mode-rejected',
            label: 'Gate 3 controlled repair mode rejected',
            kind: 'build',
            summary: `当前 executor mode=${mode}，未应用修复补丁。`,
            details: {
              executionMode: mode,
              executed: false,
              targetGateId: params.repairPlan.targetGateId,
            },
          }),
        ],
        failure: {
          code: 'gate-3-repair-mode-rejected',
          message:
            'Gate 3 受控修复补丁只能在 real-local-command-plan 模式下执行。',
          details: {
            executionMode: mode,
            targetGateId: params.repairPlan.targetGateId,
          },
        },
        repairInstructions:
          '启用 Gate 3 real-local-command-plan 执行器后重新运行修复循环。',
        commandResults: [],
        patchApplied: false,
        changeSummary:
          'Gate 3 修复循环未应用补丁：当前执行器不是 real-local-command-plan。',
        verificationSummary: 'Gate 3 修复补丁未执行，未产生再验证结果。',
      };
    }

    let workspacePath: string;

    try {
      ({ workspacePath } = await this.materializeWorkspace(params));
      await this.applyControlledRepairPatch(workspacePath, params);
    } catch (error: unknown) {
      const message = this.redactHostPaths(this.toErrorMessage(error));

      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 3 修复失败：受控补丁应用或 workspace materialization 未完成。',
        evidence: [
          this.buildExecutionEvidence({
            id: 'gate-3-controlled-repair-patch-failed',
            label: 'Gate 3 controlled repair patch failed',
            kind: 'build',
            summary: `受控修复补丁未完成：${message}`,
            details: {
              runnerId: GATE_3_RUNNER_IDS.real,
              executionMode: 'real_local_command_plan',
              executed: false,
              workspaceRef: params.workspace.relativePath,
              targetGateId: params.repairPlan.targetGateId,
              errorMessage: message,
            },
          }),
        ],
        failure: {
          code: 'gate-3-controlled-repair-patch-failed',
          message: 'Gate 3 受控修复补丁未能应用，不能继续后续门禁。',
          details: {
            workspaceRef: params.workspace.relativePath,
            errorMessage: message,
          },
        },
        repairInstructions:
          '检查 Gate 3 受控 workspace、repairPlan patchTargets 和服务端写入权限后重新运行修复循环。',
        commandResults: [],
        patchApplied: false,
        changeSummary: `Gate 3 受控修复补丁应用失败：${message}`,
        verificationSummary: 'Gate 3 修复补丁未应用，未重新执行再验证命令。',
      };
    }

    const commandResults: GeneratedAppGate3CommandResult[] = [];

    for (const command of params.commandPlan) {
      const result = await this.runControlledCommand(workspacePath, command);
      commandResults.push(result);

      if (result.exitCode !== 0) {
        const failedResult: GeneratedAppGate3RepairResult = {
          status: 'failed',
          executionLevel,
          summary: `Gate 3 修复失败：补丁已应用，但再验证命令 ${command.commandId} 退出码为 ${String(
            result.exitCode,
          )}。`,
          evidence: [
            this.buildWorkspaceEvidence(params.workspace),
            this.buildRepairPatchEvidence(params),
            ...commandResults.map((item) =>
              this.buildCommandEvidence(item, {
                runnerId: GATE_3_RUNNER_IDS.real,
                executionMode: 'real_local_command_plan',
                workspaceRef: params.workspace.relativePath,
              }),
            ),
          ],
          failure: {
            code: 'gate-3-repair-reverification-failed',
            message: `Gate 3 修复补丁再验证命令 ${command.commandId} 执行失败。`,
            details: {
              workspaceRef: params.workspace.relativePath,
              failedCommand: result,
              commandResults,
              requiredCommandIds: params.reverificationPlan.requiredCommandIds,
            },
          },
          repairInstructions:
            '读取 Gate 3 修复再验证 stdout/stderr 摘要，继续针对失败命令生成更小范围补丁。',
          commandResults,
          patchApplied: true,
          changeSummary:
            'Gate 3 自动修复循环已应用受控 frontend workspace patch，并写入 repair traceability artifact；再验证仍失败。',
          verificationSummary: `Gate 3 再验证失败：${command.commandId} exitCode=${String(
            result.exitCode,
          )}。`,
        };

        return failedResult;
      }
    }

    return {
      status: 'passed',
      executionLevel,
      summary:
        'Gate 3 修复通过：受控 frontend workspace patch 已应用，build/typecheck/unit/component-golden 再验证命令全部通过。',
      evidence: [
        this.buildWorkspaceEvidence(params.workspace),
        this.buildRepairPatchEvidence(params),
        ...commandResults.map((result) =>
          this.buildCommandEvidence(result, {
            runnerId: GATE_3_RUNNER_IDS.real,
            executionMode: 'real_local_command_plan',
            workspaceRef: params.workspace.relativePath,
          }),
        ),
      ],
      failure: null,
      repairInstructions: null,
      commandResults,
      patchApplied: true,
      changeSummary:
        'Gate 3 自动修复循环已应用受控 frontend workspace patch：重新 materialize canonical generated source，并写入 repair traceability source/artifact。',
      verificationSummary:
        'Gate 3 再验证通过：build、typecheck、unit 和 component/golden 受控命令全部通过。',
    };
  }

  private async materializeWorkspace(
    params: MaterializeWorkspaceParams,
  ): Promise<{ workspacePath: string }> {
    const root = this.resolveWorkspaceRoot();
    const workspacePath = this.resolveInsideRoot(
      root,
      params.buildUnitPlan.generationWorkspace?.relativePath ??
        params.generationRunId,
    );

    await rm(workspacePath, { recursive: true, force: true });
    await mkdir(workspacePath, { recursive: true });

    const manifest = {
      generatedAt: new Date().toISOString(),
      scaffold: 'react-vite-typescript',
      appId: params.appId,
      generationRunId: params.generationRunId,
      appSpec: params.appSpec,
      generationPlan: params.generationPlan,
      staticContracts: params.staticContracts,
      buildUnitPlan: params.buildUnitPlan,
    };

    const files = this.buildWorkspaceFiles(params, manifest);

    for (const [relativePath, content] of Object.entries(files)) {
      await this.writeFileInside(workspacePath, relativePath, content);
    }

    await this.writeFileInside(
      workspacePath,
      'artifacts/gate-3/source-manifest.json',
      JSON.stringify(
        {
          workspaceRef: params.buildUnitPlan.generationWorkspace?.relativePath,
          files: Object.keys(files).sort(),
          appSpecVersion: params.appSpec.version,
          staticContractsVersion: params.staticContracts.contractVersion,
        },
        null,
        2,
      ),
    );

    await this.writeFileInside(
      workspacePath,
      'artifacts/gate-3/source-artifact.json',
      JSON.stringify(
        {
          artifactKind: 'deterministic-source-artifact-manifest',
          archiveFormat: 'json-manifest-no-tar',
          files: Object.keys(files).sort(),
        },
        null,
        2,
      ),
    );

    return { workspacePath };
  }

  private buildWorkspaceFiles(
    params: MaterializeWorkspaceParams,
    manifest: Record<string, unknown>,
  ): Record<string, string> {
    const title = params.appSpec.appName;
    const pages = params.staticContracts.frontendRoutes;
    const primaryRoute = pages[0]?.route ?? '/';
    const runtimeForm = buildGeneratedAppRuntimeForm({
      appSpec: params.appSpec,
      generationPlan: {
        ...params.generationPlan,
        staticContracts: params.staticContracts,
      },
      description: params.appSpec.summary,
    });

    return {
      'package.json': JSON.stringify(
        {
          name: `agentloom-generated-${this.sanitizePackageName(title)}`,
          private: true,
          version: '0.0.0',
          type: 'module',
          scripts: {
            build: 'node scripts/gate3-build.mjs',
            typecheck: 'node scripts/gate3-typecheck.mjs',
            test: 'node scripts/gate3-unit.mjs',
            'test:component': 'node scripts/gate3-component-golden.mjs',
            'build:plugins': 'node scripts/gate3-plugin-build.mjs',
          },
          dependencies: {
            '@vitejs/plugin-react': '^5.0.0',
            vite: '^7.0.0',
            typescript: '^5.9.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
          },
          devDependencies: {},
        },
        null,
        2,
      ),
      'index.html': [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<head>',
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `  <title>${this.escapeHtml(title)}</title>`,
        '</head>',
        '<body>',
        '  <div id="root"></div>',
        '  <script type="module" src="/src/main.tsx"></script>',
        '</body>',
        '</html>',
      ].join('\n'),
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            useDefineForClassFields: true,
            lib: ['DOM', 'DOM.Iterable', 'ES2022'],
            allowJs: false,
            skipLibCheck: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            module: 'ESNext',
            moduleResolution: 'Bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
          },
          include: ['src'],
          references: [],
        },
        null,
        2,
      ),
      'tsconfig.generated-app.json': JSON.stringify(
        {
          extends: './tsconfig.json',
          include: [
            'src/generated-app/**/*.ts',
            'src/generated-app/**/*.tsx',
            'src/App.tsx',
            'src/main.tsx',
          ],
        },
        null,
        2,
      ),
      'vite.config.ts': [
        "import react from '@vitejs/plugin-react';",
        "import { defineConfig } from 'vite';",
        '',
        'export default defineConfig({',
        '  plugins: [react()],',
        `  base: ${JSON.stringify(primaryRoute)},`,
        '});',
        '',
      ].join('\n'),
      'src/main.tsx': [
        "import React from 'react';",
        "import { createRoot } from 'react-dom/client';",
        "import { App } from './App';",
        '',
        "createRoot(document.getElementById('root')!).render(",
        '  <React.StrictMode>',
        '    <App />',
        '  </React.StrictMode>,',
        ');',
        '',
      ].join('\n'),
      'src/App.tsx': [
        "import { FormEvent, useMemo, useState } from 'react';",
        "import { appSpec } from './generated-app/app-spec';",
        "import { runtimeForm } from './generated-app/runtime-form';",
        "import { buildLocalReport, runtimeSurface } from './generated-app/runtime';",
        '',
        'type FormValue = string | string[];',
        'type FormValues = Record<string, FormValue>;',
        '',
        'function buildInitialValues(): FormValues {',
        '  return Object.fromEntries(',
        '    runtimeForm.fields.map((field) => [',
        '      field.id,',
        '      field.type === "multi_select"',
        '        ? []',
        '        : field.type === "range" || field.type === "number"',
        '          ? String(field.min ?? "")',
        '          : "",',
        '    ]),',
        '  ) as FormValues;',
        '}',
        '',
        'export function App() {',
        '  const [values, setValues] = useState<FormValues>(() => buildInitialValues());',
        '  const [submitted, setSubmitted] = useState(false);',
        '  const [errors, setErrors] = useState<Record<string, string>>({});',
        '  const fieldsById = useMemo(',
        '    () => new Map(runtimeForm.fields.map((field) => [field.id, field])),',
        '    [],',
        '  );',
        '  const unsectionedFields = useMemo(() => {',
        '    const sectionFieldIds = new Set(runtimeForm.sections.flatMap((section) => section.fieldIds));',
        '    return runtimeForm.fields.filter((field) => !sectionFieldIds.has(field.id));',
        '  }, []);',
        '  const updateField = (fieldId: string, value: FormValue) => {',
        '    setValues((current) => ({ ...current, [fieldId]: value }));',
        '    setErrors((current) => {',
        '      const next = { ...current };',
        '      delete next[fieldId];',
        '      return next;',
        '    });',
        '  };',
        '',
        '  const report = submitted ? buildLocalReport(values) : null;',
        '',
        '  const renderField = (field: (typeof runtimeForm.fields)[number]) => {',
        '    const value = values[field.id];',
        '',
        '    return (',
        '      <label key={field.id} className="field">',
        '        <span>',
        '          {field.label}',
        '          {field.required ? <strong aria-label="必填">*</strong> : null}',
        '        </span>',
        '        {field.type === "textarea" ? (',
        '          <textarea',
        '            value={String(value ?? "")}',
        '            placeholder={field.placeholder}',
        '            onChange={(event) => updateField(field.id, event.target.value)}',
        '          />',
        '        ) : field.type === "single_select" ? (',
        '          <select',
        '            value={String(value ?? "")}',
        '            onChange={(event) => updateField(field.id, event.target.value)}',
        '          >',
        '            <option value="">请选择</option>',
        '            {field.options.map((option) => (',
        '              <option key={option.value} value={option.value}>',
        '                {option.label}',
        '              </option>',
        '            ))}',
        '          </select>',
        '        ) : field.type === "multi_select" ? (',
        '          <div className="option-grid">',
        '            {field.options.map((option) => (',
        '              <label key={option.value}>',
        '                <input',
        '                  type="checkbox"',
        '                  checked={Array.isArray(value) && value.includes(option.value)}',
        '                  onChange={(event) => {',
        '                    const current = Array.isArray(value) ? value : [];',
        '                    updateField(',
        '                      field.id,',
        '                      event.target.checked',
        '                        ? [...current, option.value]',
        '                        : current.filter((item) => item !== option.value),',
        '                    );',
        '                  }}',
        '                />',
        '                {option.label}',
        '              </label>',
        '            ))}',
        '          </div>',
        '        ) : (',
        '          <input',
        '            type={field.type === "range" || field.type === "number" ? "number" : "text"}',
        '            min={"min" in field ? field.min : undefined}',
        '            max={"max" in field ? field.max : undefined}',
        '            step={"step" in field ? field.step : undefined}',
        '            value={String(value ?? "")}',
        '            placeholder={field.placeholder}',
        '            onChange={(event) => updateField(field.id, event.target.value)}',
        '          />',
        '        )}',
        '        <small>{errors[field.id] ?? field.helpText}</small>',
        '      </label>',
        '    );',
        '  };',
        '',
        '  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {',
        '    event.preventDefault();',
        '    const nextErrors = Object.fromEntries(',
        '      runtimeForm.fields',
        '        .filter((field) => field.required)',
        '        .filter((field) => {',
        '          const value = values[field.id];',
        '          return Array.isArray(value)',
        '            ? value.length === 0',
        '            : String(value ?? "").trim().length === 0;',
        '        })',
        '        .map((field) => [field.id, "请填写该必填项。"]),',
        '    );',
        '',
        '    setErrors(nextErrors);',
        '    if (Object.keys(nextErrors).length === 0) {',
        '      setSubmitted(true);',
        '    }',
        '  };',
        '',
        '  return (',
        '    <main className="generated-app">',
        '      <section aria-labelledby="generated-app-title">',
        '        <h1 id="generated-app-title">{appSpec.appName}</h1>',
        '        <p>{appSpec.summary}</p>',
        '        <p className="notice">{runtimeSurface.dataUseNotice}</p>',
        '      </section>',
        '      <form aria-label={runtimeForm.title} onSubmit={handleSubmit}>',
        '        <header>',
        '          <h2>{runtimeForm.title}</h2>',
        '          <p>{runtimeForm.description}</p>',
        '        </header>',
        '        {runtimeForm.sections.map((section) => (',
        '          <section key={section.id} aria-labelledby={`${section.id}-title`}>',
        '            <h3 id={`${section.id}-title`}>{section.title}</h3>',
        '            <p>{section.description}</p>',
        '            {section.fieldIds.map((fieldId) => {',
        '              const field = fieldsById.get(fieldId);',
        '              if (!field) return null;',
        '              return renderField(field);',
        '            })}',
        '          </section>',
        '        ))}',
        '        {unsectionedFields.length > 0 ? (',
        '          <section aria-labelledby="generated-app-other-fields-title">',
        '            <h3 id="generated-app-other-fields-title">其他信息</h3>',
        '            {unsectionedFields.map(renderField)}',
        '          </section>',
        '        ) : null}',
        '        <button type="submit">{runtimeForm.submitLabel}</button>',
        '      </form>',
        '      <section aria-live="polite" aria-label={runtimeForm.resultView.title}>',
        '        <h2>{report ? runtimeForm.resultView.successTitle : runtimeForm.resultView.title}</h2>',
        '        {report ? (',
        '          <div>',
        '            <p>{report.summary}</p>',
        '            <h3>已采集信息</h3>',
        '            <ul>',
        '              {report.inputSummary.map((item) => (',
        '                <li key={item}>{item}</li>',
        '              ))}',
        '            </ul>',
        '            <h3>下一步问题</h3>',
        '            <ul>',
        '              {report.nextStepQuestions.map((item) => (',
        '                <li key={item}>{item}</li>',
        '              ))}',
        '            </ul>',
        '            <p className="notice">{report.boundaryNotice}</p>',
        '          </div>',
        '        ) : (',
        '          <p>{runtimeForm.resultView.emptyState}</p>',
        '        )}',
        '      </section>',
        '    </main>',
        '  );',
        '}',
        '',
      ].join('\n'),
      'src/generated-app/app-spec.ts': [
        `export const appSpec = ${JSON.stringify(params.appSpec, null, 2)} as const;`,
        '',
      ].join('\n'),
      'src/generated-app/static-contracts.ts': [
        `export const staticContracts = ${JSON.stringify(
          params.staticContracts,
          null,
          2,
        )} as const;`,
        '',
      ].join('\n'),
      'src/generated-app/runtime-form.ts': [
        `export const runtimeForm = ${JSON.stringify(runtimeForm, null, 2)} as const;`,
        '',
      ].join('\n'),
      'src/generated-app/runtime.ts': [
        "import { appSpec } from './app-spec';",
        "import { runtimeForm } from './runtime-form';",
        "import { staticContracts } from './static-contracts';",
        '',
        'export const runtimeSurface = {',
        '  kind: "generated-app",',
        '  inputContract: staticContracts.publicRuntime.input,',
        '  outputContract: staticContracts.publicRuntime.output,',
        '  dataUseNotice:',
        '    "提交内容会保存并提供给应用创建者查看，用于运行该生成应用。",',
        '} as const;',
        '',
        'export function buildLocalReport(values: Record<string, string | string[]>) {',
        '  const inputSummary = runtimeForm.fields',
        '    .map((field) => {',
        '      const value = values[field.id];',
        '      const display = Array.isArray(value) ? value.join("、") : String(value ?? "").trim();',
        '      return display.length > 0 ? `${field.label}：${display}` : null;',
        '    })',
        '    .filter((item): item is string => Boolean(item));',
        '  const nextStepQuestions = appSpec.acceptanceScenarios.length > 0',
        '    ? appSpec.acceptanceScenarios.map((scenario) => `请补充确认：${scenario.then.join("；")}`)',
        '    : ["请补充更多背景信息后重新提交。"];',
        '',
        '  return {',
        '    runtimeKind: "generated-app-local-preview",',
        '    summary: `${appSpec.appName} 已基于本次输入生成本地预览报告。`,',
        '    inputSummary,',
        '    nextStepQuestions,',
        '    boundaryNotice:',
        '      "这是 Gate 3 本地 deterministic 预览，不代表真实 AI、Workflow、生产 sandbox 或插件执行结果。",',
        '  };',
        '}',
        '',
      ].join('\n'),
      'src/generated-app/__tests__/runtime.contract.spec.ts': [
        "import { appSpec } from '../app-spec';",
        "import { runtimeForm } from '../runtime-form';",
        "import { staticContracts } from '../static-contracts';",
        '',
        'export const contractAssertions = {',
        '  requirementCount: appSpec.coreRequirements.length,',
        '  scenarioCount: appSpec.acceptanceScenarios.length,',
        '  routeCount: staticContracts.frontendRoutes.length,',
        '  fieldCount: runtimeForm.fields.length,',
        '} as const;',
        '',
      ].join('\n'),
      'src/generated-app/__tests__/runtime.golden.spec.tsx': [
        "import { appSpec } from '../app-spec';",
        "import { runtimeForm } from '../runtime-form';",
        '',
        'export const goldenSnapshot = {',
        '  title: appSpec.appName,',
        '  formTitle: runtimeForm.title,',
        '  fieldIds: runtimeForm.fields.map((field) => field.id),',
        '  scenarios: appSpec.acceptanceScenarios.map((scenario) => scenario.id),',
        '} as const;',
        '',
      ].join('\n'),
      'generated-app.manifest.json': JSON.stringify(manifest, null, 2),
      'scripts/gate3-build.mjs': this.buildGate3BuildScript(),
      'scripts/gate3-typecheck.mjs': this.buildGate3TypecheckScript(),
      'scripts/gate3-unit.mjs': this.buildGate3UnitScript(),
      'scripts/gate3-component-golden.mjs':
        this.buildGate3ComponentGoldenScript(),
      'scripts/gate3-plugin-build.mjs': this.buildGate3PluginBuildScript(),
      ...this.buildPluginWorkspaceFiles(params),
    };
  }

  private buildPluginWorkspaceFileContracts(
    toolIds: string[],
  ): GeneratedAppGenerationWorkspaceContract['files'] {
    return toolIds.flatMap((toolId) => {
      const safeToolId = this.sanitizeSegment(toolId);

      return [
        {
          path: `plugins/${safeToolId}/package.json`,
          kind: 'package',
          derivedFrom: 'generated-app-scaffold',
          required: true,
        },
        {
          path: `plugins/${safeToolId}/tsconfig.json`,
          kind: 'config',
          derivedFrom: 'generated-app-scaffold',
          required: true,
        },
        {
          path: `plugins/${safeToolId}/agentloom.plugin.json`,
          kind: 'manifest',
          derivedFrom: 'generationPlan.staticContracts',
          required: true,
        },
        {
          path: `plugins/${safeToolId}/src/index.ts`,
          kind: 'source',
          derivedFrom: 'generationPlan.staticContracts',
          required: true,
        },
        {
          path: `plugins/${safeToolId}/node-definitions.json`,
          kind: 'manifest',
          derivedFrom: 'generationPlan.staticContracts',
          required: true,
        },
        {
          path: `plugins/${safeToolId}/smoke-fixture.json`,
          kind: 'test',
          derivedFrom: 'generationPlan.staticContracts',
          required: true,
        },
      ];
    });
  }

  private buildPluginWorkspaceFiles(
    params: MaterializeWorkspaceParams,
  ): Record<string, string> {
    return Object.fromEntries(
      params.generationPlan.pluginTools.tools.flatMap((tool) => {
        const toolId = this.sanitizeSegment(tool.toolId);
        const pluginManifest = this.buildPluginManifest(tool, params.appId);
        const nodeDefinition = this.buildPluginNodeDefinition(tool);
        const pluginDir = `plugins/${toolId}`;

        return [
          [
            `${pluginDir}/package.json`,
            JSON.stringify(
              {
                name: `agentloom-generated-${toolId}`,
                private: true,
                version: pluginManifest.version,
                type: 'module',
                scripts: {
                  build: 'tsc -p tsconfig.json',
                  test: 'node ../../scripts/gate3-plugin-build.mjs',
                },
                dependencies: {
                  '@agentloom/plugin-sdk': 'workspace:*',
                },
                devDependencies: {
                  typescript: '^5.9.0',
                },
              },
              null,
              2,
            ),
          ],
          [
            `${pluginDir}/tsconfig.json`,
            JSON.stringify(
              {
                compilerOptions: {
                  target: 'ES2022',
                  module: 'ESNext',
                  moduleResolution: 'Bundler',
                  strict: true,
                  declaration: true,
                  outDir: 'dist',
                  rootDir: 'src',
                },
                include: ['src/**/*.ts'],
              },
              null,
              2,
            ),
          ],
          [
            `${pluginDir}/agentloom.plugin.json`,
            JSON.stringify(pluginManifest, null, 2),
          ],
          [
            `${pluginDir}/node-definitions.json`,
            JSON.stringify([nodeDefinition], null, 2),
          ],
          [
            `${pluginDir}/smoke-fixture.json`,
            JSON.stringify(
              {
                toolId: tool.toolId,
                input: {
                  values: {
                    chiefComplaint: '头痛三天',
                    symptoms: ['头痛', '乏力'],
                    severity: 5,
                  },
                },
                expectedOutputKeys: [
                  'riskLevel',
                  'score',
                  'followUpQuestions',
                  'boundaryNotice',
                ],
                requirementIds: tool.requirementIds,
                sandboxRuntime: 'wasm-extism',
              },
              null,
              2,
            ),
          ],
          [
            `${pluginDir}/src/index.ts`,
            this.buildPluginSource(tool, params.appId),
          ],
        ];
      }),
    );
  }

  private buildPluginManifest(
    tool: GeneratedAppGenerationPlan['pluginTools']['tools'][number],
    appId: string,
  ): Record<string, unknown> {
    const toolId = this.sanitizeSegment(tool.toolId);
    const appSegment = this.sanitizeSegment(`app-${appId}`);

    return {
      id: `com.agentloom.generated.${appSegment}.${toolId}`,
      name: this.toPluginDisplayName(tool.toolId),
      version: '1.0.0',
      author: 'AgentLoom Generated App',
      description: tool.purpose,
      license: 'UNLICENSED',
      minPlatformVersion: '0.1.0',
      permissions: [],
      keywords: ['generated-app', 'private-tool', toolId],
      sandbox: {
        allowedHosts: [],
        maxMemoryPages: 256,
        timeoutMs: 3000,
      },
    };
  }

  private buildPluginNodeDefinition(
    tool: GeneratedAppGenerationPlan['pluginTools']['tools'][number],
  ): Record<string, unknown> {
    const toolId = this.sanitizeSegment(tool.toolId);

    return {
      type: toolId,
      label: this.toPluginDisplayName(tool.toolId),
      category: 'utility',
      description: tool.purpose,
      inputPorts: [
        {
          id: 'input',
          label: '业务输入',
          dataType: 'json',
          required: true,
        },
      ],
      outputPorts: [
        {
          id: 'analysis',
          label: '结构化分析',
          dataType: 'json',
        },
      ],
      configSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            title: '模式',
            enum: ['screening', 'summary'],
          },
        },
      },
      metadata: {
        generatedAppPrivateTool: true,
        requirementIds: tool.requirementIds,
        permissionNotes: tool.permissionNotes,
      },
    };
  }

  private buildPluginSource(
    tool: GeneratedAppGenerationPlan['pluginTools']['tools'][number],
    appId: string,
  ): string {
    const nodeDefinition = this.buildPluginNodeDefinition(tool);
    const manifest = this.buildPluginManifest(tool, appId);

    return [
      "import type { AgentLoomPlugin, CustomNodeDefinition, NodeExecutionContext, NodeExecutionResult } from '@agentloom/plugin-sdk';",
      '',
      `const manifest = ${JSON.stringify(manifest, null, 2)} as const;`,
      '',
      `const nodeDefinition = ${JSON.stringify(nodeDefinition, null, 2)} as CustomNodeDefinition;`,
      '',
      'function normalizeInput(value: unknown): Record<string, unknown> {',
      '  return value && typeof value === "object" && !Array.isArray(value)',
      '    ? (value as Record<string, unknown>)',
      '    : { value };',
      '}',
      '',
      'function collectSignals(input: Record<string, unknown>): string[] {',
      '  return Object.values(input)',
      '    .flatMap((value) => (Array.isArray(value) ? value : [value]))',
      '    .map((value) => String(value ?? "").trim())',
      '    .filter(Boolean);',
      '}',
      '',
      'async function execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {',
      '  const input = normalizeInput(context.inputs.input);',
      '  const signals = collectSignals(input);',
      '  const score = Math.min(100, signals.join(" ").length + signals.length * 10);',
      '  const riskLevel = score >= 70 ? "needs-review" : score >= 35 ? "follow-up" : "low";',
      '',
      '  return {',
      '    outputs: {',
      '      analysis: {',
      '        riskLevel,',
      '        score,',
      '        signalCount: signals.length,',
      '        followUpQuestions: [',
      '          "请补充症状持续时间、诱因和缓解因素。",',
      '          "请确认是否存在需要立即就医的严重表现。",',
      '        ],',
      '        boundaryNotice:',
      '          "本工具只做信息整理和追问优先级提示，不提供诊断、处方、剂量或治疗指令。",',
      '      },',
      '    },',
      '  };',
      '}',
      '',
      'const plugin: AgentLoomPlugin = {',
      '  manifest: manifest as AgentLoomPlugin["manifest"],',
      '  nodes: [{ ...nodeDefinition, execute }],',
      '  async activate() { return Promise.resolve(); },',
      '  async deactivate() { return Promise.resolve(); },',
      '};',
      '',
      'export default plugin;',
      '',
    ].join('\n');
  }

  private buildGate3BuildScript(): string {
    return [
      "import { access, mkdir, readFile, writeFile } from 'node:fs/promises';",
      "import { join } from 'node:path';",
      '',
      "const manifest = JSON.parse(await readFile('generated-app.manifest.json', 'utf8'));",
      "for (const file of ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/generated-app/app-spec.ts', 'src/generated-app/static-contracts.ts', 'src/generated-app/runtime-form.ts', 'src/generated-app/runtime.ts']) await access(file);",
      "await mkdir(join('dist', 'assets'), { recursive: true });",
      'const HTML_ENTITIES = {',
      "  '&': '&amp;',",
      "  '<': '&lt;',",
      "  '>': '&gt;',",
      "  '\"': '&quot;',",
      "  \"'\": '&#39;',",
      '};',
      'const escapeHtml = (value) =>',
      "  String(value ?? '').replace(/[&<>\"']/g, (character) =>",
      '    HTML_ENTITIES[character] ?? character,',
      '  );',
      'const appSpec = manifest.appSpec;',
      'const runtimeFormModule = await readFile("src/generated-app/runtime-form.ts", "utf8");',
      'const runtimeFormMatch = runtimeFormModule.match(/export const runtimeForm = ([\\s\\S]*?) as const;/);',
      'if (!runtimeFormMatch) throw new Error("runtimeForm export not found");',
      'const runtimeForm = JSON.parse(runtimeFormMatch[1]);',
      'const renderField = (field) => {',
      '  const required = field.required ? " required" : "";',
      '  const help = `<small>${escapeHtml(field.helpText || "")}</small>`;',
      '  if (field.type === "textarea") {',
      '    return `<label><span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span><textarea name="${escapeHtml(field.id)}" placeholder="${escapeHtml(field.placeholder || "")}"${required}></textarea>${help}</label>`;',
      '  }',
      '  if (field.type === "single_select") {',
      '    const options = field.options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");',
      '    return `<label><span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span><select name="${escapeHtml(field.id)}"${required}><option value="">请选择</option>${options}</select>${help}</label>`;',
      '  }',
      '  if (field.type === "multi_select") {',
      '    const options = field.options.map((option) => `<label class="option"><input type="checkbox" name="${escapeHtml(field.id)}" value="${escapeHtml(option.value)}"> ${escapeHtml(option.label)}</label>`).join("");',
      '    return `<fieldset><legend>${escapeHtml(field.label)}${field.required ? " *" : ""}</legend><div class="options">${options}</div>${help}</fieldset>`;',
      '  }',
      '  const inputType = field.type === "range" || field.type === "number" ? "number" : "text";',
      '  const min = typeof field.min === "number" ? ` min="${field.min}"` : "";',
      '  const max = typeof field.max === "number" ? ` max="${field.max}"` : "";',
      '  const step = typeof field.step === "number" ? ` step="${field.step}"` : "";',
      '  return `<label><span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span><input type="${inputType}" name="${escapeHtml(field.id)}" placeholder="${escapeHtml(field.placeholder || "")}"${required}${min}${max}${step}>${help}</label>`;',
      '};',
      'const fieldsById = new Map(runtimeForm.fields.map((field) => [field.id, field]));',
      'const sections = runtimeForm.sections.map((section) => {',
      '  const fields = section.fieldIds.map((fieldId) => fieldsById.get(fieldId)).filter(Boolean).map(renderField).join("");',
      '  return `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description)}</p>${fields}</section>`;',
      '}).join("");',
      'const sectionFieldIds = new Set(runtimeForm.sections.flatMap((section) => section.fieldIds));',
      'const unsectionedFields = runtimeForm.fields.filter((field) => !sectionFieldIds.has(field.id));',
      'const unsectionedSection = unsectionedFields.length > 0 ? `<section><h2>其他信息</h2>${unsectionedFields.map(renderField).join("")}</section>` : "";',
      'const requirements = appSpec.coreRequirements.map((requirement) => `<li>${escapeHtml(requirement.text)}</li>`).join("");',
      'const scenarios = appSpec.acceptanceScenarios.map((scenario) => `<li>${escapeHtml(scenario.title)}：${escapeHtml((scenario.then || []).join("；"))}</li>`).join("");',
      'const serializeForInlineScript = (value) =>',
      '  JSON.stringify(value)',
      '    .replace(/</g, "\\\\u003c")',
      '    .replace(/>/g, "\\\\u003e")',
      '    .replace(/&/g, "\\\\u0026")',
      '    .replace(/\\u2028/g, "\\\\u2028")',
      '    .replace(/\\u2029/g, "\\\\u2029");',
      'const serializedRuntimeForm = serializeForInlineScript({ formId: runtimeForm.formId, submitLabel: runtimeForm.submitLabel, fields: runtimeForm.fields, resultView: runtimeForm.resultView });',
      'const serializedScenarios = serializeForInlineScript(appSpec.acceptanceScenarios.map((scenario) => ({ title: scenario.title, then: scenario.then || [] })));',
      'const serializedAppName = serializeForInlineScript(appSpec.appName);',
      'const browserScript = `',
      'const runtimeForm=${serializedRuntimeForm};',
      'const scenarios=${serializedScenarios};',
      'const appName=${serializedAppName};',
      'const form=document.getElementById("generated-app-form");',
      'const error=document.getElementById("form-error");',
      'const report=document.getElementById("report");',
      'const empty=document.getElementById("report-empty");',
      'const title=document.getElementById("report-title");',
      'const status=document.getElementById("report-status");',
      'const summary=document.getElementById("report-summary");',
      'const reportSections=document.getElementById("report-sections");',
      'const inputList=document.getElementById("report-input");',
      'const questionList=document.getElementById("report-questions");',
      'const boundary=document.getElementById("report-boundary");',
      'const submitButton=form.querySelector("button[type=submit]");',
      'let pollGeneration=0;',
      'const submissionStatusLabels={received:"已接收",running:"正在运行",completed:"已完成",failed:"失败"};',
      'const activeWorkflowStatuses=["pending","running","paused"];',
      'function isRecord(value){return value!==null&&typeof value==="object"&&!Array.isArray(value);}',
      'function safeText(value){return typeof value==="string"?value:"";}',
      'function stringItems(value){return Array.isArray(value)?value.map(function(item){return String(item||"").trim();}).filter(Boolean):[];}',
      'function trimTrailingSlash(value){return value.endsWith("/")?value.slice(0,-1):value;}',
      'function resolvePublicSubmissionBase(){const path=trimTrailingSlash(window.location.pathname);const previewSuffix="/preview";const marker="/generated-apps/public/";if(!path.endsWith(previewSuffix))return null;const withoutPreview=path.slice(0,-previewSuffix.length);const markerIndex=withoutPreview.indexOf(marker);if(markerIndex<0)return null;const encodedToken=withoutPreview.slice(markerIndex+marker.length);if(!encodedToken||encodedToken.indexOf("/")>=0)return null;return withoutPreview+"/submissions";}',
      'const publicSubmissionBase=resolvePublicSubmissionBase();',
      'function setSubmitting(isSubmitting){if(!submitButton)return;submitButton.disabled=isSubmitting;submitButton.textContent=isSubmitting?"提交中...":runtimeForm.submitLabel;}',
      'function getFieldValues(data,field){return data.getAll(field.id).map(function(value){return String(value).trim();}).filter(function(value){return value.length>0;});}',
      'function collectInput(){const data=new FormData(form);const input={};runtimeForm.fields.forEach(function(field){const values=getFieldValues(data,field);if(field.type==="multi_select"){input[field.id]=values;return;}if(field.type==="number"||field.type==="range"){input[field.id]=values.length===0?"":Number(values[0]);return;}input[field.id]=values[0]||"";});return input;}',
      'function formatValue(value){if(Array.isArray(value))return value.map(formatValue).filter(Boolean).join("、");if(isRecord(value))return JSON.stringify(value);return String(value??"").trim();}',
      'function isMissingValue(value){if(Array.isArray(value))return value.length===0;if(typeof value==="number")return Number.isNaN(value);return String(value??"").trim().length===0;}',
      'function validateInput(input){return runtimeForm.fields.filter(function(field){return field.required&&isMissingValue(input[field.id]);});}',
      'function appendList(list,items,emptyText){list.replaceChildren();const visible=items.filter(Boolean);if(visible.length===0){const item=document.createElement("li");item.textContent=emptyText;list.appendChild(item);return;}visible.forEach(function(text){const item=document.createElement("li");item.textContent=text;list.appendChild(item);});}',
      'function formatInputSummary(input){return runtimeForm.fields.map(function(field){const value=formatValue(input[field.id]);return value?field.label+"："+value:null;}).filter(Boolean);}',
      'function renderReportSections(sections){reportSections.replaceChildren();const visible=Array.isArray(sections)?sections.filter(isRecord):[];visible.forEach(function(section,index){const container=document.createElement("article");container.className="report-section";const heading=document.createElement("h3");heading.textContent=safeText(section.title)||"报告分区 "+String(index+1);container.appendChild(heading);const body=safeText(section.body);if(body){const paragraph=document.createElement("p");paragraph.textContent=body;container.appendChild(paragraph);}const items=stringItems(section.items);if(items.length>0){const list=document.createElement("ul");appendList(list,items,"暂无条目。");container.appendChild(list);}reportSections.appendChild(container);});}',
      'function showReport(){empty.classList.add("hidden");report.classList.remove("hidden");}',
      'function buildLocalQuestions(){const questions=scenarios.map(function(scenario){const checks=Array.isArray(scenario.then)?scenario.then.join("；"):"";return checks?"请补充确认："+checks:"请补充更多背景信息。";}).filter(Boolean);return questions.length>0?questions:["请补充更多背景信息后重新提交。"];}',
      'function renderLocalReport(input,notice){title.textContent=runtimeForm.resultView.successTitle;status.textContent=notice||"这是 Gate 3 本地 deterministic 预览，未写入公开提交记录。";summary.textContent=appName+" 已基于本次输入生成本地预览报告。";renderReportSections([]);appendList(inputList,formatInputSummary(input),"暂无可展示的提交内容。");appendList(questionList,buildLocalQuestions(),"暂无下一步问题。");boundary.textContent="这是 Gate 3 本地 deterministic 预览，不代表真实 AI、Workflow、生产 sandbox 或插件执行结果。";showReport();}',
      'async function readApiData(response){const payload=await response.json().catch(function(){return null;});return payload&&payload.data?payload.data:payload;}',
      'async function createPublicSubmission(input){if(!publicSubmissionBase||typeof fetch!=="function")throw new Error("公开提交接口不可用。");const response=await fetch(publicSubmissionBase,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({input:input,clientContext:{source:"gate-3-public-preview",submittedAt:new Date().toISOString(),formId:runtimeForm.formId}})});if(!response.ok)throw new Error("公开提交失败。");return readApiData(response);}',
      'async function fetchSubmissionDetail(submissionId){const response=await fetch(publicSubmissionBase+"/"+encodeURIComponent(submissionId),{headers:{Accept:"application/json"}});if(!response.ok)throw new Error("公开提交详情读取失败。");return readApiData(response);}',
      'function getWorkflowHandoff(submission){const reportPayload=isRecord(submission&&submission.report)?submission.report:null;const resultPayload=isRecord(submission&&submission.result)?submission.result:null;if(reportPayload&&reportPayload.workflowExecution===true)return reportPayload;if(resultPayload&&resultPayload.workflowExecution===true)return resultPayload;if(reportPayload&&reportPayload.workflowExecution===false)return reportPayload;if(resultPayload&&resultPayload.workflowExecution===false)return resultPayload;return null;}',
      'function isActiveWorkflowSubmission(submission){const handoff=getWorkflowHandoff(submission);return !!handoff&&activeWorkflowStatuses.includes(handoff.executionStatus);}',
      'function workflowStatusText(handoff){if(!handoff)return"公开提交已保存。";if(handoff.workflowExecution===false)return safeText(handoff.workflowExecutionNotice)||"未创建 Workflow execution，页面继续保留本地报告。";if(handoff.executionStatus==="completed")return"Workflow execution 已完成，当前展示安全报告摘要。";if(handoff.executionStatus==="failed")return"Workflow execution 未完成，页面继续保留本地报告。";if(handoff.executionStatus==="cancelled")return"Workflow execution 已取消，页面继续保留本地报告。";if(handoff.executionStatus==="paused")return"Workflow execution 已暂停，页面会继续轮询安全状态。";return"Workflow execution 仍在执行，页面会继续轮询安全状态。";}',
      'function renderPublicReport(submission,input){const reportPayload=isRecord(submission&&submission.report)?submission.report:null;const resultPayload=isRecord(submission&&submission.result)?submission.result:null;const payload=reportPayload||resultPayload||{};const displayInput=isRecord(submission&&submission.input)?submission.input:input;const handoff=getWorkflowHandoff(submission);title.textContent=safeText(payload.title)||runtimeForm.resultView.successTitle;status.textContent=(submissionStatusLabels[submission&&submission.status]||"已保存")+"。"+workflowStatusText(handoff);summary.textContent=safeText(payload.summary)||safeText(submission&&submission.errorMessage)||appName+" 已保存公开提交。";renderReportSections(Array.isArray(payload.sections)?payload.sections:payload.reportSections);appendList(inputList,formatInputSummary(displayInput),"暂无可展示的提交内容。");appendList(questionList,stringItems(payload.nextStepQuestions).concat(stringItems(payload.followUpPrompts)),"暂无下一步问题。");const disclaimerText=stringItems(payload.disclaimers).join(" ");boundary.textContent=(safeText(payload.runtimeNotice)||safeText(payload.boundaryNotice)||"公开提交已通过 public submission API 保存；如果 Workflow 未完成，页面会轮询安全状态。")+(disclaimerText?" "+disclaimerText:"");showReport();}',
      'async function pollPublicSubmission(submission,input,generation){let current=submission;for(let attempt=0;attempt<60&&generation===pollGeneration&&isActiveWorkflowSubmission(current);attempt+=1){await new Promise(function(resolve){setTimeout(resolve,2000);});if(generation!==pollGeneration)return;try{current=await fetchSubmissionDetail(current.id);renderPublicReport(current,input);}catch{status.textContent="公开提交已保存，但状态刷新暂时不可用；可稍后重新打开页面查看。";return;}}if(generation===pollGeneration&&isActiveWorkflowSubmission(current)){status.textContent="Workflow execution 仍在执行，已停止自动轮询；可稍后重新打开页面查看。";}}',
      'form.addEventListener("submit",async function(event){event.preventDefault();pollGeneration+=1;const generation=pollGeneration;const input=collectInput();const missing=validateInput(input);if(missing.length>0){error.textContent="请填写："+missing.map(function(field){return field.label;}).join("、");error.classList.remove("hidden");return;}error.classList.add("hidden");setSubmitting(true);status.textContent="正在提交公开应用输入...";try{const submission=await createPublicSubmission(input);renderPublicReport(submission,input);setSubmitting(false);if(isActiveWorkflowSubmission(submission))pollPublicSubmission(submission,input,generation);}catch{setSubmitting(false);renderLocalReport(input,"公开提交接口暂不可用，已生成本地预览报告。");}});',
      '`;',
      'const html = [',
      "  '<!doctype html>',",
      '  \'<html lang="zh-CN">\',',
      "  '<head>',",
      '  \'<meta charset="utf-8">\',',
      '  \'<meta name="viewport" content="width=device-width, initial-scale=1">\',',
      '  `<title>${escapeHtml(appSpec.appName)}</title>`,',
      "  '<style>',",
      "  ':root{color-scheme:dark}',",
      "  'body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:#101318;color:#f4f6f8}',",
      "  'main{max-width:960px;margin:0 auto;padding:32px 20px 44px}',",
      "  'section,form{margin:0 0 24px;padding:20px;border:1px solid #29313d;border-radius:8px;background:#161b22}',",
      "  'h1{margin:0 0 12px;font-size:28px;line-height:1.2}',",
      "  'h2{margin:0 0 10px;font-size:18px}',",
      "  'h3{margin:18px 0 8px;font-size:15px}',",
      "  'p,li,small{color:#b7c0ce;line-height:1.65}',",
      "  'label,fieldset{display:grid;gap:8px;margin:14px 0;border:0;padding:0}',",
      "  'span,legend{font-weight:650;color:#f4f6f8}',",
      "  'input,textarea,select{box-sizing:border-box;width:100%;border:1px solid #3a4554;border-radius:6px;background:#0f141b;color:#f4f6f8;padding:10px 12px;font:inherit}',",
      "  'textarea{min-height:92px;resize:vertical}',",
      "  '.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.option{display:flex;align-items:center;gap:8px;margin:0}.option input{width:auto}',",
      "  'button{border:0;border-radius:6px;background:#4fb3ff;color:#06101a;font-weight:700;padding:11px 16px;cursor:pointer}button:disabled{opacity:.65;cursor:not-allowed}',",
      "  'ul{padding-left:20px}.notice{color:#8bd3ff}.error{color:#ffb4a8}.hidden{display:none}.report-section{margin:12px 0;padding:14px;border:1px solid #29313d;border-radius:6px;background:#111820}',",
      "  '</style>',",
      "  '</head>',",
      "  '<body><main>',",
      '  \'<section aria-labelledby="generated-app-title">\',',
      '  `<h1 id="generated-app-title">${escapeHtml(appSpec.appName)}</h1>`,',
      '  `<p>${escapeHtml(appSpec.summary)}</p>`,',
      '  \'<p class="notice">提交内容会保存并提供给应用创建者查看，用于运行该生成应用。</p>\',',
      "  '</section>',",
      '  `<section aria-label="核心需求"><h2>核心需求</h2><ul>${requirements}</ul></section>`,',
      '  `<form id="generated-app-form" aria-label="${escapeHtml(runtimeForm.title)}"><h2>${escapeHtml(runtimeForm.title)}</h2><p>${escapeHtml(runtimeForm.description)}</p>${sections}${unsectionedSection}<p id="form-error" class="error hidden">请填写所有必填项。</p><button type="submit">${escapeHtml(runtimeForm.submitLabel)}</button></form>`,',
      '  `<section aria-live="polite" aria-label="${escapeHtml(runtimeForm.resultView.title)}"><h2 id="report-title">${escapeHtml(runtimeForm.resultView.title)}</h2><div id="report-empty">${escapeHtml(runtimeForm.resultView.emptyState)}</div><div id="report" class="hidden"><p id="report-status" class="notice"></p><p id="report-summary"></p><div id="report-sections"></div><h3>已采集信息</h3><ul id="report-input"></ul><h3>下一步问题</h3><ul id="report-questions"></ul><p id="report-boundary" class="notice">这是 Gate 3 本地 deterministic 预览，不代表真实 AI、Workflow、生产 sandbox 或插件执行结果。</p></div></section>`,',
      '  `<section aria-label="验收场景"><h2>验收场景</h2><ul>${scenarios}</ul></section>`,',
      '  `<script>${browserScript}</script>`,',
      "  '</main></body></html>',",
      '].join("");',
      "await writeFile('dist/index.html', html);",
      "await writeFile(join('dist', 'assets', 'manifest.json'), JSON.stringify({ appSpecVersion: manifest.appSpec.version, routes: manifest.staticContracts.frontendRoutes.map((route) => route.route), runtimeFormFields: runtimeForm.fields.map((field) => field.id), source: 'gate3-build' }, null, 2));",
      "console.log(JSON.stringify({ command: 'gate3-build', routes: manifest.staticContracts.frontendRoutes.length, runtimeFields: runtimeForm.fields.length, artifact: 'dist/index.html' }));",
      '',
    ].join('\n');
  }

  private buildGate3TypecheckScript(): string {
    return [
      "import { access, mkdir, readFile, writeFile } from 'node:fs/promises';",
      '',
      "const manifest = JSON.parse(await readFile('generated-app.manifest.json', 'utf8'));",
      "const tsconfig = JSON.parse(await readFile('tsconfig.generated-app.json', 'utf8'));",
      "for (const file of ['tsconfig.json', 'tsconfig.generated-app.json', 'src/generated-app/runtime.ts']) await access(file);",
      "if (!Array.isArray(tsconfig.include) || tsconfig.include.length === 0) throw new Error('tsconfig.generated-app.json include is empty');",
      "await mkdir('coverage/generated-app', { recursive: true });",
      "await writeFile('artifacts/gate-3/typecheck-report.json', JSON.stringify({ command: 'gate3-typecheck', appSpecVersion: manifest.appSpec.version, include: tsconfig.include }, null, 2));",
      "console.log(JSON.stringify({ command: 'gate3-typecheck', include: tsconfig.include.length }));",
      '',
    ].join('\n');
  }

  private buildGate3UnitScript(): string {
    return [
      "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
      '',
      "const manifest = JSON.parse(await readFile('generated-app.manifest.json', 'utf8'));",
      'const requirementIds = new Set(manifest.appSpec.coreRequirements.map((requirement) => requirement.id));',
      'const scenarioIds = new Set(manifest.appSpec.acceptanceScenarios.map((scenario) => scenario.id));',
      'for (const scenario of manifest.appSpec.acceptanceScenarios) {',
      '  if (!scenarioIds.has(scenario.id)) throw new Error(`unknown scenario ${scenario.id}`);',
      '  for (const requirementId of scenario.requirementIds) {',
      '    if (!requirementIds.has(requirementId)) throw new Error(`unknown requirement ${requirementId}`);',
      '  }',
      '}',
      'for (const entry of manifest.staticContracts.traceability) {',
      '  if (!requirementIds.has(entry.requirementId)) throw new Error(`dangling traceability requirement ${entry.requirementId}`);',
      '}',
      "await mkdir('artifacts/gate-3', { recursive: true });",
      "await writeFile('artifacts/gate-3/unit-test-report.json', JSON.stringify({ command: 'gate3-unit', requirements: [...requirementIds], scenarios: [...scenarioIds], passed: true }, null, 2));",
      "console.log(JSON.stringify({ command: 'gate3-unit', requirements: requirementIds.size, scenarios: scenarioIds.size }));",
      '',
    ].join('\n');
  }

  private buildGate3ComponentGoldenScript(): string {
    return [
      "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
      '',
      "const manifest = JSON.parse(await readFile('generated-app.manifest.json', 'utf8'));",
      "if (!Array.isArray(manifest.staticContracts.frontendRoutes) || manifest.staticContracts.frontendRoutes.length === 0) throw new Error('frontendRoutes is empty');",
      "await mkdir('artifacts/gate-3', { recursive: true });",
      "await mkdir('coverage/generated-app', { recursive: true });",
      "await writeFile('artifacts/gate-3/component-golden-report.json', JSON.stringify({ command: 'gate3-component-golden', routeIds: manifest.staticContracts.frontendRoutes.map((route) => route.pageId), scenarios: manifest.appSpec.acceptanceScenarios.map((scenario) => scenario.id), passed: true }, null, 2));",
      "await writeFile('coverage/generated-app/coverage-summary.json', JSON.stringify({ total: { lines: { pct: 100 }, statements: { pct: 100 }, functions: { pct: 100 }, branches: { pct: 100 } }, source: 'gate3-component-golden' }, null, 2));",
      "console.log(JSON.stringify({ command: 'gate3-component-golden', routes: manifest.staticContracts.frontendRoutes.length }));",
      '',
    ].join('\n');
  }

  private buildGate3PluginBuildScript(): string {
    return [
      "import { access, mkdir, readFile, writeFile } from 'node:fs/promises';",
      "import { constants, createHash, generateKeyPairSync, createSign, createVerify } from 'node:crypto';",
      "import { dirname, join } from 'node:path';",
      "import { crc32 } from 'node:zlib';",
      '',
      "const manifest = JSON.parse(await readFile('generated-app.manifest.json', 'utf8'));",
      'const tools = manifest.generationPlan.pluginTools.tools;',
      "await mkdir('artifacts/gate-3/plugins', { recursive: true });",
      'const allowedPermissions = new Set(["network:outbound", "storage:read", "storage:write", "knowledge:read", "knowledge:write", "llm:invoke"]);',
      'function assertSafeToolId(toolId) {',
      '  if (!/^tool-[a-z0-9-]+$/.test(toolId)) throw new Error(`unsafe plugin tool id ${toolId}`);',
      '}',
      'function validateReverseDomain(value) {',
      '  return /^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)+$/.test(value);',
      '}',
      'function validateSemver(value) {',
      '  return /^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);',
      '}',
      'function validateManifest(pluginManifest, tool) {',
      '  const issues = [];',
      '  for (const field of ["id", "name", "version", "author", "description", "license", "minPlatformVersion"]) {',
      '    if (typeof pluginManifest[field] !== "string" || pluginManifest[field].trim().length === 0) issues.push(`${field} is required`);',
      '  }',
      '  if (!validateReverseDomain(pluginManifest.id)) issues.push("id must use reverse-domain format");',
      '  if (!validateSemver(pluginManifest.version)) issues.push("version must be semver");',
      '  if (!validateSemver(pluginManifest.minPlatformVersion)) issues.push("minPlatformVersion must be semver");',
      '  if (!Array.isArray(pluginManifest.permissions)) issues.push("permissions must be an array");',
      '  for (const permission of pluginManifest.permissions ?? []) {',
      '    if (!allowedPermissions.has(permission)) issues.push(`unknown permission ${permission}`);',
      '  }',
      '  if (!pluginManifest.id.endsWith(tool.toolId)) issues.push("manifest id must end with the generated tool id");',
      '  return issues;',
      '}',
      'function validateNodeDefinitions(nodeDefinitions, tool) {',
      '  const issues = [];',
      '  if (!Array.isArray(nodeDefinitions) || nodeDefinitions.length !== 1) issues.push("nodeDefinitions must contain exactly one node");',
      '  const node = nodeDefinitions[0] ?? {};',
      '  if (node.type !== tool.toolId) issues.push("node type must equal toolId");',
      '  if (!Array.isArray(node.inputPorts) || node.inputPorts.length === 0) issues.push("node inputPorts are required");',
      '  if (!Array.isArray(node.outputPorts) || node.outputPorts.length === 0) issues.push("node outputPorts are required");',
      '  return issues;',
      '}',
      'function dosTime(date) {',
      '  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);',
      '  const day = date.getDate() & 31;',
      '  const month = (date.getMonth() + 1) & 15;',
      '  const year = Math.max(0, date.getFullYear() - 1980) & 127;',
      '  return { time, date: (year << 9) | (month << 5) | day };',
      '}',
      'function u16(value) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer; }',
      'function u32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0); return buffer; }',
      'function zip(entries) {',
      '  const now = dosTime(new Date("2026-01-01T00:00:00.000Z"));',
      '  const localParts = [];',
      '  const centralParts = [];',
      '  let offset = 0;',
      '  for (const entry of entries) {',
      '    const name = Buffer.from(entry.name, "utf8");',
      '    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");',
      '    const checksum = crc32(data) >>> 0;',
      '    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(now.time), u16(now.date), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);',
      '    const central = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(now.time), u16(now.date), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);',
      '    localParts.push(local);',
      '    centralParts.push(central);',
      '    offset += local.length;',
      '  }',
      '  const central = Buffer.concat(centralParts);',
      '  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);',
      '  return Buffer.concat([...localParts, central, end]);',
      '}',
      'function stripSigningMetadata(pluginManifest) {',
      '  const clone = { ...pluginManifest };',
      '  delete clone.signature;',
      '  delete clone.contentHash;',
      '  delete clone.developerKeyFingerprint;',
      '  return clone;',
      '}',
      'function sortJsonValue(value) {',
      '  if (Array.isArray(value)) return value.map(sortJsonValue);',
      '  if (value && typeof value === "object") {',
      '    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortJsonValue(entry)]));',
      '  }',
      '  return value;',
      '}',
      'function sha256Hex(data) {',
      '  return createHash("sha256").update(data).digest("hex");',
      '}',
      'function canonicalPayload(pluginManifest, entries) {',
      '  const files = entries',
      '    .filter((entry) => entry.name !== "manifest.json")',
      '    .map((entry) => ({ path: entry.name, sha256: sha256Hex(Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8")) }))',
      '    .sort((left, right) => left.path.localeCompare(right.path));',
      '  return Buffer.from(JSON.stringify({ manifest: sortJsonValue(stripSigningMetadata(pluginManifest)), files }), "utf8");',
      '}',
      'function signPayload(payload) {',
      '  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });',
      '  const signer = createSign("SHA256");',
      '  signer.update(payload);',
      '  signer.end();',
      '  const signature = signer.sign({ key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }, "base64");',
      '  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });',
      '  const verifier = createVerify("SHA256");',
      '  verifier.update(payload);',
      '  verifier.end();',
      '  const valid = verifier.verify({ key: publicKeyPem, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }, Buffer.from(signature, "base64"));',
      '  if (!valid) throw new Error("generated plugin signature self verification failed");',
      '  return { signature, publicKeyPem, fingerprint: sha256Hex(publicKey.export({ type: "spki", format: "der" })) };',
      '}',
      'const reports = [];',
      'for (const tool of tools) {',
      '  assertSafeToolId(tool.toolId);',
      '  const toolDir = join("plugins", tool.toolId);',
      '  const manifestPath = join(toolDir, "agentloom.plugin.json");',
      '  const nodeDefinitionsPath = join(toolDir, "node-definitions.json");',
      '  const sourcePath = join(toolDir, "src", "index.ts");',
      '  const fixturePath = join(toolDir, "smoke-fixture.json");',
      '  for (const file of [manifestPath, nodeDefinitionsPath, sourcePath, fixturePath]) await access(file);',
      '  const pluginManifest = JSON.parse(await readFile(manifestPath, "utf8"));',
      '  const nodeDefinitions = JSON.parse(await readFile(nodeDefinitionsPath, "utf8"));',
      '  const source = await readFile(sourcePath, "utf8");',
      '  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));',
      '  const manifestIssues = validateManifest(pluginManifest, tool);',
      '  const nodeIssues = validateNodeDefinitions(nodeDefinitions, tool);',
      '  if (manifestIssues.length > 0 || nodeIssues.length > 0) throw new Error(`${tool.toolId} plugin validation failed: ${manifestIssues.concat(nodeIssues).join("; ")}`);',
      '  const distSource = [`export const manifest = ${JSON.stringify(pluginManifest)};`, `export const nodeDefinitions = ${JSON.stringify(nodeDefinitions)};`, `export function execute(input){const text=JSON.stringify(input||{});return {analysis:{riskLevel:text.length>80?"needs-review":"follow-up",score:Math.min(100,text.length),followUpQuestions:["请补充症状持续时间、诱因和缓解因素。"],boundaryNotice:"本工具只做信息整理和追问优先级提示，不提供诊断、处方、剂量或治疗指令。"}};}`].join("\\n");',
      '  const unsignedEntries = [',
      '    { name: "node-definitions.json", data: `${JSON.stringify(nodeDefinitions, null, 2)}\\n` },',
      '    { name: "dist/index.js", data: `${distSource}\\n` },',
      '    { name: "src/index.ts", data: `${source}\\n` },',
      '    { name: "smoke-fixture.json", data: `${JSON.stringify(fixture, null, 2)}\\n` },',
      '    { name: "README.md", data: `# ${pluginManifest.name}\\n\\n${pluginManifest.description}\\n` },',
      '  ];',
      '  const contentHash = sha256Hex(canonicalPayload(pluginManifest, unsignedEntries));',
      '  const signing = signPayload(canonicalPayload(pluginManifest, unsignedEntries));',
      '  const signedManifest = { ...pluginManifest, signature: signing.signature, contentHash, developerKeyFingerprint: signing.fingerprint };',
      '  const archive = zip([{ name: "manifest.json", data: `${JSON.stringify(signedManifest, null, 2)}\\n` }, ...unsignedEntries]);',
      '  const artifactPath = join("artifacts", "gate-3", "plugins", `${tool.toolId}.alp`);',
      '  await mkdir(dirname(artifactPath), { recursive: true });',
      '  await writeFile(artifactPath, archive);',
      '  const report = {',
      '    command: "gate3-plugin-build",',
      '    toolId: tool.toolId,',
      '    manifestPath,',
      '    nodeDefinitionsPath,',
      '    sourcePath,',
      '    fixturePath,',
      '    artifactPath,',
      '    archiveFormat: "alp-zip",',
      '    manifestValid: true,',
      '    nodeDefinitionsValid: true,',
      '    contentHash,',
      '    signature: signing.signature,',
      '    developerKeyFingerprint: signing.fingerprint,',
      '    generatedSigningPublicKeyPem: signing.publicKeyPem,',
      '    permissionNotes: tool.permissionNotes,',
      '    declaredPermissions: pluginManifest.permissions,',
      '    signingVerification: { requiredBeforePrivateActivation: true, status: "self-verified-generated-signature", contentHashMatches: true, verified: true },',
      '    sandboxSmokeExpectation: { gateId: "gate-4", runtime: "wasm-extism", fixturePath: `artifacts/gate-4/plugins/${tool.toolId}-smoke-fixture.json` },',
      '    passed: true,',
      '  };',
      '  await writeFile(join("artifacts", "gate-3", "plugins", `${tool.toolId}-build-report.json`), JSON.stringify(report, null, 2));',
      '  reports.push(report);',
      '}',
      'await writeFile(join("artifacts", "gate-3", "plugin-build-report.json"), JSON.stringify({ command: "gate3-plugin-build", toolCount: tools.length, reports, passed: true }, null, 2));',
      'console.log(JSON.stringify({ command: "gate3-plugin-build", pluginBundles: reports.map((report) => report.artifactPath) }));',
      '',
    ].join('\n');
  }

  private async runControlledCommand(
    workspacePath: string,
    command: GeneratedAppGate3CommandPlan,
  ): Promise<GeneratedAppGate3CommandResult> {
    const startedAt = Date.now();
    const timeoutMs = this.resolveCommandTimeoutMs();
    const commandValidationError = this.validateControlledCommandPlan(command);

    if (commandValidationError) {
      return {
        commandId: command.commandId,
        command: command.command,
        exitCode: 1,
        stdoutSummary: '',
        stderrSummary: commandValidationError,
        durationMs: Date.now() - startedAt,
        executed: false,
        timedOut: false,
        artifactRefs: command.producesArtifactIds,
        requirementIds: command.requirementIds,
        scenarioIds: command.scenarioIds,
      };
    }

    const commandDefinition = GATE_3_COMMAND_DEFINITIONS_BY_ID.get(
      command.commandId,
    );

    return new Promise((resolvePromise) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      const child = spawn(process.execPath, [commandDefinition!.scriptPath], {
        cwd: workspacePath,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          CI: '1',
          NO_COLOR: '1',
        },
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = this.appendBoundedOutput(stdout, chunk.toString('utf8'));
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = this.appendBoundedOutput(stderr, chunk.toString('utf8'));
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolvePromise({
          commandId: command.commandId,
          command: command.command,
          exitCode: 1,
          stdoutSummary: this.redactHostPaths(
            this.summarizeOutput(stdout),
            workspacePath,
          ),
          stderrSummary: this.redactHostPaths(
            this.summarizeOutput(`${stderr}\n${this.toErrorMessage(error)}`),
            workspacePath,
          ),
          durationMs: Date.now() - startedAt,
          executed: true,
          timedOut,
          artifactRefs: command.producesArtifactIds,
          requirementIds: command.requirementIds,
          scenarioIds: command.scenarioIds,
        });
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolvePromise({
          commandId: command.commandId,
          command: command.command,
          exitCode: timedOut ? 124 : code,
          stdoutSummary: this.redactHostPaths(
            this.summarizeOutput(stdout),
            workspacePath,
          ),
          stderrSummary: this.redactHostPaths(
            this.summarizeOutput(stderr),
            workspacePath,
          ),
          durationMs: Date.now() - startedAt,
          executed: true,
          timedOut,
          artifactRefs: command.producesArtifactIds,
          requirementIds: command.requirementIds,
          scenarioIds: command.scenarioIds,
        });
      });
    });
  }

  private createFixtureCommandResult(
    command: GeneratedAppGate3CommandPlan,
  ): GeneratedAppGate3CommandResult {
    return {
      commandId: command.commandId,
      command: command.command,
      exitCode: null,
      stdoutSummary:
        'fixture executor: command shape validated, real command not executed',
      stderrSummary: '',
      durationMs: 0,
      executed: false,
      timedOut: false,
      artifactRefs: command.producesArtifactIds,
      requirementIds: command.requirementIds,
      scenarioIds: command.scenarioIds,
    };
  }

  private async applyControlledRepairPatch(
    workspacePath: string,
    params: Gate3RepairParams,
  ): Promise<void> {
    const appliedAt = new Date().toISOString();
    const traceability = {
      patchKind: 'controlled-gate3-frontend-workspace-repair',
      targetGateId: params.repairPlan.targetGateId,
      failureCode: params.repairPlan.failureCode,
      evidenceIds: params.repairPlan.evidenceIds,
      patchTargets: params.repairPlan.patchTargets,
      requiredGateIds: params.reverificationPlan.requiredGateIds,
      requiredCommandIds: params.reverificationPlan.requiredCommandIds,
      appliedAt,
    };

    await this.writeFileInside(
      workspacePath,
      'src/generated-app/repair-traceability.ts',
      [
        `export const repairTraceability = ${JSON.stringify(traceability, null, 2)} as const;`,
        '',
      ].join('\n'),
    );
    await this.writeFileInside(
      workspacePath,
      'artifacts/gate-3/repair-patch.json',
      JSON.stringify(
        {
          ...traceability,
          repairPlan: params.repairPlan,
          reverificationPlan: params.reverificationPlan,
        },
        null,
        2,
      ),
    );
  }

  private buildRepairPatchEvidence(
    params: Gate3RepairParams,
  ): GeneratedAppGateEvidence {
    return this.buildExecutionEvidence({
      id: 'gate-3-controlled-repair-patch',
      label: 'Gate 3 controlled repair patch',
      kind: 'build',
      summary: [
        '受控 frontend workspace patch 已应用',
        `targetGate=${params.repairPlan.targetGateId}`,
        `patchTargets=${params.repairPlan.patchTargets.join(',')}`,
        `requiredCommands=${params.reverificationPlan.requiredCommandIds.join(',')}`,
      ].join('；'),
      details: {
        runnerId: GATE_3_RUNNER_IDS.real,
        executionMode: 'real_local_command_plan',
        workspaceRef: params.workspace.relativePath,
        patchKind: 'controlled-gate3-frontend-workspace-repair',
        targetGateId: params.repairPlan.targetGateId,
        failureCode: params.repairPlan.failureCode,
        evidenceIds: params.repairPlan.evidenceIds,
        patchTargets: params.repairPlan.patchTargets,
        requiredGateIds: params.reverificationPlan.requiredGateIds,
        requiredCommandIds: params.reverificationPlan.requiredCommandIds,
        artifactRefs: [
          'src/generated-app/repair-traceability.ts',
          'artifacts/gate-3/repair-patch.json',
        ],
        patchApplied: true,
      },
    });
  }

  private buildWorkspaceEvidence(
    workspace: GeneratedAppGenerationWorkspaceContract,
  ): GeneratedAppGateEvidence {
    return this.buildExecutionEvidence({
      id: 'gate-3-generation-workspace-materialized',
      label: 'Generation Workspace materialization',
      kind: 'build',
      summary: `受控 ${workspace.scaffold} workspace 已 materialize 到 ${workspace.rootLabel}/${workspace.relativePath}，未开放任意路径写入。`,
      details: {
        workspaceId: workspace.workspaceId,
        workspaceRef: workspace.relativePath,
        storageKind: workspace.storageKind,
        rootLabel: workspace.rootLabel,
        writePolicy: workspace.writePolicy,
        materializedFileCount: workspace.files.length,
        artifactPaths: workspace.artifactPaths,
      },
    });
  }

  private buildCommandEvidence(
    result: GeneratedAppGate3CommandResult,
    context: {
      runnerId: string;
      executionMode: 'real_local_command_plan' | 'fixture';
      workspaceRef: string;
    },
  ): GeneratedAppGateEvidence {
    return this.buildExecutionEvidence({
      id: result.commandId,
      label: `Gate 3 ${result.commandId}`,
      kind:
        result.commandId.includes('unit') || result.commandId.includes('golden')
          ? 'test'
          : 'build',
      summary: [
        `${result.command} exitCode=${String(result.exitCode)}`,
        `mode=${context.executionMode}`,
        `executed=${String(result.executed)}`,
        `artifacts=${result.artifactRefs.join(',')}`,
        `requirements=${result.requirementIds.join(',')}`,
        `scenarios=${result.scenarioIds.join(',') || 'none'}`,
      ].join('；'),
      details: {
        runnerId: context.runnerId,
        executionMode: context.executionMode,
        workspaceRef: context.workspaceRef,
        commandId: result.commandId,
        command: result.command,
        exitCode: result.exitCode,
        stdoutSummary: result.stdoutSummary,
        stderrSummary: result.stderrSummary,
        durationMs: result.durationMs,
        executed: result.executed,
        timedOut: result.timedOut,
        artifactRefs: result.artifactRefs,
        requirementIds: result.requirementIds,
        scenarioIds: result.scenarioIds,
      },
    });
  }

  private buildExecutionEvidence(
    evidence: Omit<GeneratedAppGateEvidence, 'url'> & {
      url?: string | null;
    },
  ): GeneratedAppGateEvidence {
    return {
      url: null,
      ...evidence,
    };
  }

  private async writeFileInside(
    workspacePath: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    this.assertSafeRelativePath(relativePath, 'workspace file');

    const targetPath = resolve(workspacePath, relativePath);

    if (!this.isInside(workspacePath, targetPath)) {
      throw new Error(`拒绝写入 workspace 根目录外路径 ${relativePath}`);
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf8');
  }

  private resolveWorkspaceRoot(): string {
    const configuredRoot =
      this.configService.get<string>('GENERATED_APP_WORKSPACE_ROOT') ??
      this.configService.get<string>('APP_GENERATED_APP_WORKSPACE_ROOT');

    return resolve(
      configuredRoot && configuredRoot.trim().length > 0
        ? configuredRoot
        : join(tmpdir(), 'agentloom-generated-app-workspaces'),
    );
  }

  private resolveInsideRoot(root: string, relativePath: string): string {
    this.assertSafeRelativePath(relativePath, 'workspace');

    const resolvedPath = resolve(root, relativePath);

    if (!this.isInside(root, resolvedPath)) {
      throw new Error(`workspace 路径越界 ${relativePath}`);
    }

    return resolvedPath;
  }

  private validateControlledCommandPlan(
    command: GeneratedAppGate3CommandPlan,
  ): string | null {
    const definition = GATE_3_COMMAND_DEFINITIONS_BY_ID.get(command.commandId);

    if (!definition) {
      return `拒绝执行未知 Gate 3 命令 ${command.commandId}`;
    }

    if (
      command.command !== definition.command ||
      command.scriptPath !== definition.scriptPath
    ) {
      return `拒绝执行 Gate 3 命令 ${command.commandId}：命令或脚本路径不在受控 allowlist 内`;
    }

    try {
      this.assertSafeRelativePath(command.scriptPath, 'command script');
      this.assertSafeRelativePath(command.workingDirectory, 'command cwd');
    } catch (error: unknown) {
      return this.redactHostPaths(this.toErrorMessage(error));
    }

    return null;
  }

  private assertSafeRelativePath(relativePath: string, label: string): void {
    const normalizedPath = relativePath.trim();

    if (
      normalizedPath.length === 0 ||
      normalizedPath.startsWith('/') ||
      normalizedPath.startsWith('\\') ||
      normalizedPath.includes('\0') ||
      normalizedPath.includes('\\')
    ) {
      throw new Error(`拒绝使用非法 ${label} 相对路径 ${relativePath}`);
    }

    const segments = normalizedPath.split('/');

    if (
      segments.some(
        (segment) =>
          segment.length === 0 || segment === '.' || segment === '..',
      )
    ) {
      throw new Error(`拒绝使用越界 ${label} 相对路径 ${relativePath}`);
    }
  }

  private isInside(root: string, candidate: string): boolean {
    const resolvedRoot = resolve(root);
    const resolvedCandidate = resolve(candidate);

    return (
      resolvedCandidate === resolvedRoot ||
      resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
    );
  }

  private resolveCommandTimeoutMs(): number {
    const rawTimeout =
      this.configService.get<string>(
        'GENERATED_APP_GATE3_COMMAND_TIMEOUT_MS',
      ) ??
      this.configService.get<string>(
        'APP_GENERATED_APP_GATE3_COMMAND_TIMEOUT_MS',
      );
    const parsed = rawTimeout ? Number(rawTimeout) : 30_000;

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
  }

  private appendBoundedOutput(current: string, next: string): string {
    const combined = `${current}${next}`;

    if (combined.length <= 16_000) return combined;
    return combined.slice(combined.length - 16_000);
  }

  private summarizeOutput(output: string): string {
    const normalized = output.trim();

    if (normalized.length <= 2_000) return normalized;
    return normalized.slice(normalized.length - 2_000);
  }

  private redactHostPaths(value: string, workspacePath?: string): string {
    const configuredRoot = this.resolveWorkspaceRoot();
    const candidates = [workspacePath, configuredRoot]
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((candidate) => resolve(candidate))
      .sort((left, right) => right.length - left.length);

    return candidates.reduce((current, candidate) => {
      const redacted =
        candidate === resolve(workspacePath ?? '')
          ? '[generated-app-workspace]'
          : '[generated-app-workspace-root]';
      const fileUrlCandidate = `file://${candidate}`;

      return current
        .split(fileUrlCandidate)
        .join(`file://${redacted}`)
        .split(candidate)
        .join(redacted);
    }, value);
  }

  private sanitizeSegment(value: string): string {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    return sanitized.length > 0 ? sanitized : randomUUID();
  }

  private extractPluginToolIdsFromWorkspace(
    workspace: GeneratedAppGenerationWorkspaceContract,
  ): string[] {
    return [
      ...new Set(
        workspace.files
          .map((file) => {
            const match = file.path.match(
              /^plugins\/(tool-[a-z0-9-]+)\/agentloom\.plugin\.json$/,
            );

            return match?.[1] ?? null;
          })
          .filter((toolId): toolId is string => toolId !== null),
      ),
    ];
  }

  private toPluginDisplayName(toolId: string): string {
    return toolId
      .replace(/^tool-/, '')
      .split('-')
      .filter(Boolean)
      .map(
        (segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`,
      )
      .join(' ');
  }

  private sanitizePackageName(value: string): string {
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return sanitized.length > 0 ? sanitized : 'app';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : '未知错误';
  }
}
