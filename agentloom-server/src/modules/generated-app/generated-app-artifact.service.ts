// 生成应用交付物（ADR-0007）：Gate 3 工作区文件与 Gate 5 每个场景 × 视口的截图、trace 都存在对象存储
// 同一应用前缀下。工作区文件按 `buildUnitPlan.workspace` 只读列出与内联读取（D-176）；截图与 trace
// 由创建者经短时预签名链接查看（D-146）；删除应用时整个应用前缀一并清理（D-177）。

import { Injectable, Logger } from '@nestjs/common';

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
import { buildGate5ArtifactPrefix } from './generated-app-browser-acceptance.dispatcher';
import { getGenerationPlanV2 } from './generated-app.gate-v2.util';
import {
  buildGate3WorkspacePrefix,
  resolveWorkspaceFileContentType,
} from './generated-app.gate3-workspace';
import {
  GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES,
  buildGeneratedAppStoragePrefix,
} from './generated-app.internal';
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

type WorkspaceObjectStat = { size: number; lastModified: Date };

/** artifactId 是 URL 段：路径中的分隔符与点号统一换成 `-` */
function toArtifactIdSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-');
}

@Injectable()
export class GeneratedAppArtifactService {
  private readonly logger = new Logger(GeneratedAppArtifactService.name);

  constructor(
    private readonly repository: GeneratedAppRepository,
    private readonly storageService: StorageService,
  ) {}

  async getArtifactManifest(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppArtifactManifestResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    const plan = getGenerationPlanV2(app.generationPlan);
    const workspace = plan?.buildUnitPlan?.workspace ?? null;
    const workspaceArtifacts =
      plan && workspace
        ? await this.listWorkspaceArtifacts(
            buildGate3WorkspacePrefix({
              tenantId,
              appId,
              generationRunId: plan.generationRunId,
            }),
            workspace.files,
          )
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

  /**
   * 只读取工作区文本文件；浏览器产物没有内联内容，用清单里的 downloadUrl 查看。
   * 对象 key 按租户、应用与运行重新推导，不信任计划里记录的前缀；对象存储不可用时抛 503。
   */
  async getArtifactContent(
    tenantId: string,
    appId: string,
    artifactId: string,
  ): Promise<GeneratedAppArtifactContentResponseDto> {
    const app = await this.repository.findGeneratedAppRecord(tenantId, appId);
    const plan = getGenerationPlanV2(app.generationPlan);
    const file = plan?.buildUnitPlan?.workspace?.files.find(
      (item) => `gate-3-${toArtifactIdSegment(item.path)}` === artifactId,
    );
    if (!plan || !file) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }

    const key = this.resolveWorkspaceObjectKey(
      buildGate3WorkspacePrefix({
        tenantId,
        appId,
        generationRunId: plan.generationRunId,
      }),
      file.path,
    );
    const objectStat = await this.storageService.stat(key);
    if (!objectStat) {
      throw new GeneratedAppArtifactNotFoundException(artifactId);
    }
    if (objectStat.size > GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES) {
      throw new GeneratedAppArtifactTooLargeException(
        artifactId,
        GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES,
      );
    }

    const stream = await this.storageService.download(key);
    const content = Buffer.concat(await stream.toArray()).toString('utf8');
    return {
      artifact: this.toWorkspaceArtifactSummary(file, objectStat),
      content,
      truncated: false,
    };
  }

  /**
   * 删除应用前清理它在对象存储下的全部对象（Gate 3 工作区、Gate 5 截图与 trace）。
   * 失败时抛 StorageUnavailableException，调用方据此保留应用记录，用户可重试删除。
   */
  async deleteAppObjects(tenantId: string, appId: string): Promise<void> {
    const prefix = buildGeneratedAppStoragePrefix(tenantId, appId);
    const deleted = await this.storageService.deletePrefix(prefix);
    this.logger.log(
      `已清理生成应用 ${appId} 的对象存储前缀，删除 ${deleted} 个对象`,
    );
  }

  /**
   * 把计划里的工作区文件路径拼到本次运行的工作区前缀下；绝对路径、`..`、`.`、反斜杠、空段一律按不存在处理，
   * 计划被篡改也读不到前缀之外的对象。
   */
  resolveWorkspaceObjectKey(prefix: string, relativePath: string): string {
    if (
      relativePath.includes('\0') ||
      relativePath.includes('\\') ||
      relativePath
        .split('/')
        .some(
          (segment) =>
            segment.trim().length === 0 || segment === '.' || segment === '..',
        )
    ) {
      throw new GeneratedAppArtifactNotFoundException(relativePath);
    }
    return `${prefix}/${relativePath}`;
  }

  /** 对象存储不可用或路径非法时清单照常返回，对应文件标为未物化 */
  private listWorkspaceArtifacts(
    prefix: string,
    files: GeneratedAppWorkspaceFile[],
  ): Promise<GeneratedAppArtifactSummaryDto[]> {
    return Promise.all(
      files.map(async (file) => {
        let objectStat: WorkspaceObjectStat | null = null;
        try {
          objectStat = await this.storageService.stat(
            this.resolveWorkspaceObjectKey(prefix, file.path),
          );
        } catch (error) {
          if (!(error instanceof GeneratedAppArtifactNotFoundException)) {
            this.logger.warn(
              `生成应用工作区文件状态读取失败：${(error as Error).message}`,
            );
          }
        }
        return this.toWorkspaceArtifactSummary(file, objectStat);
      }),
    );
  }

  private toWorkspaceArtifactSummary(
    file: GeneratedAppWorkspaceFile,
    objectStat: WorkspaceObjectStat | null,
  ): GeneratedAppArtifactSummaryDto {
    return {
      artifactId: `gate-3-${toArtifactIdSegment(file.path)}`,
      label: file.path,
      kind: WORKSPACE_FILE_KINDS[file.kind],
      path: file.path,
      materialized: objectStat !== null,
      sizeBytes: objectStat?.size ?? null,
      contentType: resolveWorkspaceFileContentType(file.path),
      readable:
        objectStat !== null &&
        objectStat.size <= GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES,
      downloadUrl: null,
      scenarioId: null,
      viewportId: null,
      updatedAt: objectStat?.lastModified ?? null,
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
    const expectedPrefix = `${buildGate5ArtifactPrefix(tenantId, appId, plan.generationRunId)}/`;
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
