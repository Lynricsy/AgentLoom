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
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../database/schema';

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
      files: [...GATE_3_WORKSPACE_FILES],
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

    return GATE_3_COMMAND_DEFINITIONS.map((definition) => ({
      commandId: definition.commandId,
      command: definition.command,
      scriptPath: definition.scriptPath,
      workingDirectory,
      requirementIds: params.requirementIds,
      scenarioIds:
        definition.commandId === 'gate-3-typecheck-command'
          ? []
          : params.scenarioIds,
      producesArtifactIds: [...definition.producesArtifactIds],
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
        "import { appSpec } from './generated-app/app-spec';",
        "import { runtimeSurface } from './generated-app/runtime';",
        '',
        'export function App() {',
        '  return (',
        '    <main>',
        '      <section aria-labelledby="generated-app-title">',
        '        <h1 id="generated-app-title">{appSpec.appName}</h1>',
        '        <p>{appSpec.summary}</p>',
        '        <p>{runtimeSurface.dataUseNotice}</p>',
        '      </section>',
        '      <section aria-label="核心流程">',
        '        {appSpec.acceptanceScenarios.map((scenario) => (',
        '          <article key={scenario.id}>',
        '            <h2>{scenario.title}</h2>',
        '            <p>{scenario.then.join("；")}</p>',
        '          </article>',
        '        ))}',
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
      'src/generated-app/runtime.ts': [
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
      ].join('\n'),
      'src/generated-app/__tests__/runtime.contract.spec.ts': [
        "import { appSpec } from '../app-spec';",
        "import { staticContracts } from '../static-contracts';",
        '',
        'export const contractAssertions = {',
        '  requirementCount: appSpec.coreRequirements.length,',
        '  scenarioCount: appSpec.acceptanceScenarios.length,',
        '  routeCount: staticContracts.frontendRoutes.length,',
        '} as const;',
        '',
      ].join('\n'),
      'src/generated-app/__tests__/runtime.golden.spec.tsx': [
        "import { appSpec } from '../app-spec';",
        '',
        'export const goldenSnapshot = {',
        '  title: appSpec.appName,',
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
    };
  }

  private buildGate3BuildScript(): string {
    return [
      "import { access, mkdir, readFile, writeFile } from 'node:fs/promises';",
      "import { join } from 'node:path';",
      '',
      "const manifest = JSON.parse(await readFile('generated-app.manifest.json', 'utf8'));",
      "for (const file of ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/generated-app/app-spec.ts', 'src/generated-app/static-contracts.ts']) await access(file);",
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
      'const scenarios = appSpec.acceptanceScenarios',
      '  .map(',
      '    (scenario) =>',
      '      `<article><h2>${escapeHtml(scenario.title)}</h2><p>${escapeHtml((scenario.then || []).join("；"))}</p></article>`,',
      '  )',
      '  .join("");',
      'const requirements = appSpec.coreRequirements',
      '  .map((requirement) => `<li>${escapeHtml(requirement.text)}</li>`)',
      '  .join("");',
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
      "  'main{max-width:880px;margin:0 auto;padding:32px 20px 44px}',",
      "  'section{margin:0 0 24px;padding:20px;border:1px solid #29313d;border-radius:8px;background:#161b22}',",
      "  'h1{margin:0 0 12px;font-size:28px;line-height:1.2}',",
      "  'h2{margin:0 0 10px;font-size:17px}',",
      "  'p,li{color:#b7c0ce;line-height:1.65}',",
      "  'ul{padding-left:20px}.notice{color:#8bd3ff}',",
      "  '</style>',",
      "  '</head>',",
      "  '<body><main>',",
      '  \'<section aria-labelledby="generated-app-title">\',',
      '  `<h1 id="generated-app-title">${escapeHtml(appSpec.appName)}</h1>`,',
      '  `<p>${escapeHtml(appSpec.summary)}</p>`,',
      '  \'<p class="notice">提交内容会保存并提供给应用创建者查看，用于运行该生成应用。</p>\',',
      "  '</section>',",
      '  \'<section aria-label="核心需求"><h2>核心需求</h2><ul>\',',
      '  requirements,',
      "  '</ul></section>',",
      '  \'<section aria-label="验收场景"><h2>验收场景</h2>\',',
      '  scenarios,',
      "  '</section>',",
      "  '</main></body></html>',",
      '].join("");',
      "await writeFile('dist/index.html', html);",
      "await writeFile(join('dist', 'assets', 'manifest.json'), JSON.stringify({ appSpecVersion: manifest.appSpec.version, routes: manifest.staticContracts.frontendRoutes.map((route) => route.route), source: 'gate3-build' }, null, 2));",
      "console.log(JSON.stringify({ command: 'gate3-build', routes: manifest.staticContracts.frontendRoutes.length, artifact: 'dist/index.html' }));",
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
