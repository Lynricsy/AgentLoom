// 生成应用交付物（ADR-0007）：Gate 3 受控工作区内的文件按 `buildUnitPlan.workspace` 只读列出与读取；
// Gate 5 每个场景 × 视口的截图与 trace 存在对象存储，创建者经短时预签名链接查看（D-146）。

import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StorageService } from '../../infrastructure/storage/storage.service';
import type {
  GeneratedAppArtifactContentResponseDto,
  GeneratedAppArtifactKind,
  GeneratedAppArtifactManifestResponseDto,
  GeneratedAppArtifactSummaryDto,
} from './dto';
import {
  GeneratedAppArtifactNotFoundException,
  GeneratedAppArtifactTooLargeException,
} from './generated-app.exceptions';
import { getGenerationPlanV2 } from './generated-app.gate-v2.util';
import { resolveGeneratedAppWorkspaceRoot } from './generated-app.gate3-workspace';
import { GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES } from './generated-app.internal';
import { GeneratedAppRepository } from './generated-app.repository';
import type {
  GeneratedAppGenerationPlanV2,
  GeneratedAppWorkspaceFile,
} from './types/generation-plan-v2.types';

/** 预签名链接有效期：够创建者打开截图/下载 trace，不长期暴露对象 */
export const GENERATED_APP_ARTIFACT_PRESIGN_EXPIRY_SECONDS = 15 * 60;

const WORKSPACE_FILE_KINDS = {
  source: 'workspace_source_file',
  test: 'workspace_test_file',
  report: 'workspace_report',
  manifest: 'workspace_manifest',
} as const satisfies Record<
  GeneratedAppWorkspaceFile['kind'],
  GeneratedAppArtifactKind
>;

const WORKSPACE_CONTENT_TYPES: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html',
};

/** artifactId 是 URL 段：路径中的分隔符与点号统一换成 `-` */
function toArtifactIdSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-');
}

@Injectable()
export class GeneratedAppArtifactService {
  private readonly logger = new Logger(GeneratedAppArtifactService.name);

  constructor(
    private readonly repository: GeneratedAppRepository,
    private readonly configService: ConfigService,
    @Optional() private readonly storageService?: StorageService,
  ) {}

  async getArtifactManifest(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppArtifactManifestResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    const plan = getGenerationPlanV2(app.generationPlan);
    const workspace = plan?.buildUnitPlan?.workspace ?? null;
    const workspaceArtifacts = workspace
      ? await this.listWorkspaceArtifacts(workspace)
      : [];
    const browserArtifacts = plan
      ? await this.listBrowserArtifacts(tenantId, appId, plan)
      : [];

    return {
      workspace:
        workspace && plan?.buildUnitPlan
          ? {
              relativePath: workspace.relativePath,
              executionLevel: plan.buildUnitPlan.executionLevel,
              materialized: workspaceArtifacts.some(
                (artifact) => artifact.materialized,
              ),
            }
          : null,
      generationRunId: plan?.generationRunId ?? null,
      artifacts: [...workspaceArtifacts, ...browserArtifacts],
      updatedAt: app.updatedAt,
    };
  }

  /** 只读取工作区文本文件；浏览器产物没有内联内容，用清单里的 downloadUrl 查看 */
  async getArtifactContent(
    tenantId: string,
    appId: string,
    artifactId: string,
  ): Promise<GeneratedAppArtifactContentResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    const workspace =
      getGenerationPlanV2(app.generationPlan)?.buildUnitPlan?.workspace ?? null;
    const file = workspace?.files.find(
      (item) => `gate-3-${toArtifactIdSegment(item.path)}` === artifactId,
    );
    if (!workspace || !file) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }

    const summary = await this.toWorkspaceArtifactSummary(
      workspace.relativePath,
      file,
    );
    if (!summary.materialized) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }
    if (
      summary.sizeBytes !== null &&
      summary.sizeBytes > GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES
    ) {
      throw new GeneratedAppArtifactTooLargeException(
        artifactId,
        GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES,
      );
    }

    const content = await readFile(
      this.resolveWorkspaceFilePath(workspace.relativePath, file.path),
      'utf8',
    );
    return { artifact: summary, content, truncated: false };
  }

  /**
   * 把计划里的相对路径解析到受控根目录内；绝对路径、`..`、反斜杠、空段一律按不存在处理，
   * 计划被篡改也读不到根目录之外的文件。
   */
  resolveSafeRelativePathInside(root: string, relativePath: string): string {
    const trimmedPath = relativePath.trim();
    const segments = trimmedPath.split('/');
    if (
      trimmedPath.length === 0 ||
      trimmedPath.startsWith('/') ||
      trimmedPath.includes('\0') ||
      trimmedPath.includes('\\') ||
      segments.some(
        (segment) =>
          segment.length === 0 || segment === '.' || segment === '..',
      )
    ) {
      throw new GeneratedAppArtifactNotFoundException(relativePath);
    }

    const resolvedRoot = resolve(root);
    const resolvedPath = resolve(resolvedRoot, trimmedPath);
    if (
      resolvedPath !== resolvedRoot &&
      !resolvedPath.startsWith(`${resolvedRoot}${sep}`)
    ) {
      throw new GeneratedAppArtifactNotFoundException(relativePath);
    }
    return resolvedPath;
  }

  private resolveWorkspaceFilePath(
    workspaceRelativePath: string,
    filePath: string,
  ): string {
    const workspacePath = this.resolveSafeRelativePathInside(
      resolveGeneratedAppWorkspaceRoot(this.configService),
      workspaceRelativePath,
    );
    return this.resolveSafeRelativePathInside(workspacePath, filePath);
  }

  private listWorkspaceArtifacts(
    workspace: NonNullable<
      NonNullable<GeneratedAppGenerationPlanV2['buildUnitPlan']>['workspace']
    >,
  ): Promise<GeneratedAppArtifactSummaryDto[]> {
    return Promise.all(
      workspace.files.map((file) =>
        this.toWorkspaceArtifactSummary(workspace.relativePath, file),
      ),
    );
  }

  private async toWorkspaceArtifactSummary(
    workspaceRelativePath: string,
    file: GeneratedAppWorkspaceFile,
  ): Promise<GeneratedAppArtifactSummaryDto> {
    let sizeBytes: number | null = null;
    let updatedAt: Date | null = null;
    try {
      const fileStat = await stat(
        this.resolveWorkspaceFilePath(workspaceRelativePath, file.path),
      );
      if (fileStat.isFile()) {
        sizeBytes = fileStat.size;
        updatedAt = fileStat.mtime;
      }
    } catch {
      // 工作区被清理或路径非法：清单里标为未物化
    }
    const extension = file.path.slice(file.path.lastIndexOf('.'));
    const materialized = sizeBytes !== null;

    return {
      artifactId: `gate-3-${toArtifactIdSegment(file.path)}`,
      label: file.path,
      kind: WORKSPACE_FILE_KINDS[file.kind],
      path: file.path,
      materialized,
      sizeBytes,
      contentType: WORKSPACE_CONTENT_TYPES[extension] ?? 'text/plain',
      readable:
        materialized &&
        sizeBytes !== null &&
        sizeBytes <= GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES,
      downloadUrl: null,
      scenarioId: null,
      viewportId: null,
      updatedAt,
    };
  }

  /**
   * Gate 5 的截图与 trace：只签发本应用、本次运行 gate-5 前缀下的 key，
   * 计划里出现其他 key 时不签名（按未物化列出）。
   */
  private async listBrowserArtifacts(
    tenantId: string,
    appId: string,
    plan: GeneratedAppGenerationPlanV2,
  ): Promise<GeneratedAppArtifactSummaryDto[]> {
    const scenarios = plan.browserAcceptancePlan?.result?.scenarios ?? [];
    const expectedPrefix = `tenants/${tenantId}/generated-apps/${appId}/runs/${plan.generationRunId}/gate-5/`;
    const entries = scenarios.flatMap((scenario) =>
      (
        [
          ['screenshot', scenario.artifacts.screenshotKey],
          ['trace', scenario.artifacts.traceKey],
        ] as const
      )
        .filter((entry): entry is readonly ['screenshot' | 'trace', string] =>
          Boolean(entry[1]),
        )
        .map(([type, key]) => ({ scenario, type, key })),
    );

    return Promise.all(
      entries.map(async ({ scenario, type, key }) => {
        const trusted = key.startsWith(expectedPrefix) && !key.includes('..');
        const downloadUrl = trusted ? await this.presign(key) : null;
        return {
          artifactId: `gate-5-${toArtifactIdSegment(scenario.scenarioId)}-${scenario.viewportId}-${type}`,
          label: `${scenario.scenarioId} · ${scenario.viewportId === 'desktop' ? '桌面' : '移动'} · ${type === 'screenshot' ? '截图' : 'trace'}`,
          kind: type === 'screenshot' ? 'browser_screenshot' : 'browser_trace',
          path: key,
          materialized: trusted,
          sizeBytes: null,
          contentType: type === 'screenshot' ? 'image/png' : 'application/zip',
          readable: false,
          downloadUrl,
          scenarioId: scenario.scenarioId,
          viewportId: scenario.viewportId,
          updatedAt: null,
        } satisfies GeneratedAppArtifactSummaryDto;
      }),
    );
  }

  /** 对象存储不可用时清单照常返回，只是没有下载链接 */
  private async presign(key: string): Promise<string | null> {
    if (!this.storageService) return null;
    try {
      return await this.storageService.getPresignedUrl(
        key,
        GENERATED_APP_ARTIFACT_PRESIGN_EXPIRY_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `生成应用浏览器产物预签名失败：${(error as Error).message}`,
      );
      return null;
    }
  }
}
