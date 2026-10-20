import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { GeneratedApp } from '../../../database/schema';
import type { StorageService } from '../../../infrastructure/storage/storage.service';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import {
  GeneratedAppArtifactNotFoundException,
  GeneratedAppArtifactTooLargeException,
} from '../generated-app.exceptions';
import { GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES } from '../generated-app.internal';
import { GeneratedAppRepository } from '../generated-app.repository';
import type { GeneratedAppBrowserScenarioResult } from '../types/browser-acceptance-job.schema';
import type { GeneratedAppGenerationPlanV2 } from '../types/generation-plan-v2.types';
import {
  APP_ID,
  GENERATION_RUN_ID,
  NOW,
  TENANT_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_VERSION_ID,
  createConfigService,
  createGeneratedApp,
  createStorageServiceMock,
  mockTenantDb,
} from './generated-app-test-support';

const WORKSPACE_RELATIVE_PATH = `tenants/${TENANT_ID}/generated-apps/${APP_ID}/runs/${GENERATION_RUN_ID}/gate-3`;
const GATE_5_PREFIX = `tenants/${TENANT_ID}/generated-apps/${APP_ID}/runs/${GENERATION_RUN_ID}/gate-5`;

function scenarioResult(
  viewportId: 'desktop' | 'mobile',
  artifacts: GeneratedAppBrowserScenarioResult['artifacts'],
): GeneratedAppBrowserScenarioResult {
  return {
    scenarioId: 'scenario-ask',
    viewportId,
    status: 'passed',
    durationMs: 1200,
    failure: null,
    submissionId: null,
    consoleErrors: [],
    failedRequests: [],
    resultTexts: { answer: '最多 10 个' },
    artifacts,
  };
}

function createPlan(
  scenarios: GeneratedAppBrowserScenarioResult[] = [],
): GeneratedAppGenerationPlanV2 {
  return {
    planVersion: 2,
    generationRunId: GENERATION_RUN_ID,
    appSpecSha256: 'a'.repeat(64),
    binding: {
      kind: 'workflow',
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
    },
    coverage: {
      requirements: [],
      unassertedSectionIds: [],
      untouchedFieldIds: [],
    },
    buildUnitPlan: {
      executionLevel: 'real',
      workspace: {
        relativePath: WORKSPACE_RELATIVE_PATH,
        files: [
          {
            path: 'src/generated-app/app-spec.ts',
            kind: 'source',
            sha256: 'b'.repeat(64),
            sizeBytes: 12,
          },
          {
            path: 'reports/contract-cases.json',
            kind: 'report',
            sha256: 'c'.repeat(64),
            sizeBytes: 2,
          },
        ],
      },
      contractCases: [],
    },
    browserAcceptancePlan: {
      planVersion: 2,
      executionLevel: 'real',
      scenarioIds: ['scenario-ask'],
      viewports: ['desktop', 'mobile'],
      artifactPrefix: GATE_5_PREFIX,
      jobId: GENERATION_RUN_ID,
      result: {
        jobVersion: 1,
        status: 'passed',
        runnerError: null,
        browser: { name: 'chromium', version: '140.0' },
        playwrightVersion: '1.55.0',
        startedAt: NOW.toISOString(),
        completedAt: NOW.toISOString(),
        scenarios,
      },
    },
  };
}

describe('GeneratedAppArtifactService（v2 交付物）', () => {
  let objects: Map<string, string>;
  let storage: StorageService;
  let repository: GeneratedAppRepository;
  let service: GeneratedAppArtifactService;

  function mockApp(overrides: Partial<GeneratedApp>) {
    vi.spyOn(repository, 'findGeneratedAppRecord').mockResolvedValue(
      createGeneratedApp(overrides),
    );
  }

  /** Gate 3 写入对象存储的工作区文件；artifact service 只能从对象存储读到它 */
  function putWorkspaceObject(path: string, content: string) {
    objects.set(`${WORKSPACE_RELATIVE_PATH}/${path}`, content);
  }

  beforeEach(() => {
    objects = new Map();
    storage = createStorageServiceMock({
      stat: vi.fn(async (key: string) => {
        const content = objects.get(key);
        return content === undefined
          ? null
          : { size: Buffer.byteLength(content), lastModified: NOW };
      }),
      download: vi.fn(async (key: string) => {
        const content = objects.get(key);
        if (content === undefined) throw new Error(`missing ${key}`);
        return Readable.from([Buffer.from(content)]);
      }),
    });
    const configService = createConfigService();
    repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      configService,
    );
    service = new GeneratedAppArtifactService(repository, storage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('还没有 v2 生成计划时清单为空，不读工作区也不签名', async () => {
    mockApp({ generationPlan: null });

    await expect(
      service.getArtifactManifest(TENANT_ID, APP_ID),
    ).resolves.toEqual({
      workspace: null,
      generationRunId: null,
      artifacts: [],
      updatedAt: NOW,
    });
    expect(storage.getPresignedUrl).not.toHaveBeenCalled();
  });

  it('按 buildUnitPlan.workspace 从对象存储列出 Gate 3 文件：已写入的带大小可读，缺失的标为未物化', async () => {
    putWorkspaceObject('src/generated-app/app-spec.ts', 'export {};\n');
    mockApp({ generationPlan: createPlan() });

    const manifest = await service.getArtifactManifest(TENANT_ID, APP_ID);

    expect(manifest.workspace).toEqual({
      relativePath: WORKSPACE_RELATIVE_PATH,
      executionLevel: 'real',
      materialized: true,
    });
    expect(manifest.generationRunId).toBe(GENERATION_RUN_ID);
    expect(manifest.artifacts).toEqual([
      expect.objectContaining({
        artifactId: 'gate-3-src-generated-app-app-spec-ts',
        kind: 'workspace_source_file',
        path: 'src/generated-app/app-spec.ts',
        materialized: true,
        sizeBytes: 11,
        contentType: 'text/typescript',
        readable: true,
        downloadUrl: null,
      }),
      expect.objectContaining({
        artifactId: 'gate-3-reports-contract-cases-json',
        kind: 'workspace_report',
        materialized: false,
        sizeBytes: null,
        readable: false,
      }),
    ]);
  });

  it('Gate 5 截图与 trace 返回短时预签名链接，只签本应用本次运行 gate-5 前缀下的 key', async () => {
    const foreignKey = `tenants/${TENANT_ID}/generated-apps/other-app/runs/${GENERATION_RUN_ID}/gate-5/x.png`;
    mockApp({
      generationPlan: createPlan([
        scenarioResult('desktop', {
          screenshotKey: `${GATE_5_PREFIX}/scenario-ask/desktop/screenshot.png`,
          traceKey: `${GATE_5_PREFIX}/scenario-ask/desktop/trace.zip`,
        }),
        scenarioResult('mobile', { screenshotKey: foreignKey, traceKey: null }),
      ]),
    });

    const manifest = await service.getArtifactManifest(TENANT_ID, APP_ID);
    const browser = manifest.artifacts.filter((artifact) =>
      artifact.kind.startsWith('browser_'),
    );

    expect(browser).toEqual([
      expect.objectContaining({
        artifactId: 'gate-5-scenario-ask-desktop-screenshot',
        kind: 'browser_screenshot',
        contentType: 'image/png',
        materialized: true,
        readable: false,
        scenarioId: 'scenario-ask',
        viewportId: 'desktop',
        downloadUrl: `https://minio.example.test/${GATE_5_PREFIX}/scenario-ask/desktop/screenshot.png?X-Amz-Signature=sig`,
      }),
      expect.objectContaining({
        artifactId: 'gate-5-scenario-ask-desktop-trace',
        kind: 'browser_trace',
        contentType: 'application/zip',
        downloadUrl: expect.stringContaining('trace.zip'),
      }),
      expect.objectContaining({
        artifactId: 'gate-5-scenario-ask-mobile-screenshot',
        materialized: false,
        downloadUrl: null,
      }),
    ]);
    expect(storage.getPresignedUrl).toHaveBeenCalledTimes(2);
    expect(storage.getPresignedUrl).toHaveBeenCalledWith(
      `${GATE_5_PREFIX}/scenario-ask/desktop/screenshot.png`,
      900,
    );
    expect(storage.getPresignedUrl).not.toHaveBeenCalledWith(
      foreignKey,
      expect.anything(),
    );
  });

  it('对象存储签名失败时清单照常返回，只是没有下载链接', async () => {
    vi.mocked(storage.getPresignedUrl).mockRejectedValue(
      new Error('minio down'),
    );
    mockApp({
      generationPlan: createPlan([
        scenarioResult('desktop', {
          screenshotKey: `${GATE_5_PREFIX}/scenario-ask/desktop/screenshot.png`,
          traceKey: null,
        }),
      ]),
    });

    const manifest = await service.getArtifactManifest(TENANT_ID, APP_ID);

    expect(
      manifest.artifacts.find((item) => item.kind === 'browser_screenshot'),
    ).toMatchObject({ materialized: true, downloadUrl: null });
  });

  it('按 artifactId 内联读取工作区文本文件', async () => {
    putWorkspaceObject('src/generated-app/app-spec.ts', 'export {};\n');
    mockApp({ generationPlan: createPlan() });

    await expect(
      service.getArtifactContent(
        TENANT_ID,
        APP_ID,
        'gate-3-src-generated-app-app-spec-ts',
      ),
    ).resolves.toMatchObject({
      artifact: { path: 'src/generated-app/app-spec.ts', readable: true },
      content: 'export {};\n',
      truncated: false,
    });
  });

  it('未知 id、浏览器产物、未物化文件与路径越出本次运行前缀的工作区文件都按不存在处理', async () => {
    mockApp({ generationPlan: createPlan() });
    for (const artifactId of [
      '../secret',
      'gate-5-scenario-ask-desktop-screenshot',
      'gate-3-reports-contract-cases-json',
    ]) {
      await expect(
        service.getArtifactContent(TENANT_ID, APP_ID, artifactId),
      ).rejects.toBeInstanceOf(GeneratedAppArtifactNotFoundException);
    }

    // 计划被篡改：工作区前缀指向别的应用、文件路径带 `..`；对象 key 只按本应用本次运行推导
    const foreignPrefix = `tenants/${TENANT_ID}/generated-apps/other-app/runs/${GENERATION_RUN_ID}/gate-3`;
    objects.set(`${foreignPrefix}/src/generated-app/app-spec.ts`, 'leak');
    objects.set(`${WORKSPACE_RELATIVE_PATH}/../x.ts`, 'leak');
    const plan = createPlan();
    plan.buildUnitPlan!.workspace = {
      relativePath: foreignPrefix,
      files: [
        ...plan.buildUnitPlan!.workspace!.files,
        {
          path: '../x.ts',
          kind: 'source',
          sha256: 'd'.repeat(64),
          sizeBytes: 4,
        },
      ],
    };
    mockApp({ generationPlan: plan });
    for (const artifactId of [
      'gate-3-src-generated-app-app-spec-ts',
      'gate-3--x-ts',
    ]) {
      await expect(
        service.getArtifactContent(TENANT_ID, APP_ID, artifactId),
      ).rejects.toBeInstanceOf(GeneratedAppArtifactNotFoundException);
    }
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('对象存储不可用时清单照常返回，工作区文件标为未物化', async () => {
    putWorkspaceObject('src/generated-app/app-spec.ts', 'export {};\n');
    vi.mocked(storage.stat).mockRejectedValue(new Error('minio down'));
    mockApp({ generationPlan: createPlan() });

    const manifest = await service.getArtifactManifest(TENANT_ID, APP_ID);
    expect(manifest.workspace?.materialized).toBe(false);
    expect(manifest.artifacts[0]).toMatchObject({
      materialized: false,
      readable: false,
    });
  });

  it('删除应用时清理该应用在对象存储下的整个前缀', async () => {
    vi.mocked(storage.deletePrefix).mockResolvedValue(7);

    await service.deleteAppObjects(TENANT_ID, APP_ID);

    expect(storage.deletePrefix).toHaveBeenCalledWith(
      `tenants/${TENANT_ID}/generated-apps/${APP_ID}/`,
    );
  });

  it('超过内联上限的文件拒绝读取内容', async () => {
    putWorkspaceObject(
      'src/generated-app/app-spec.ts',
      'x'.repeat(GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES + 1),
    );
    mockApp({ generationPlan: createPlan() });

    await expect(
      service.getArtifactContent(
        TENANT_ID,
        APP_ID,
        'gate-3-src-generated-app-app-spec-ts',
      ),
    ).rejects.toBeInstanceOf(GeneratedAppArtifactTooLargeException);
  });
});
