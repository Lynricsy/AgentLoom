// 本文件集中 Generated App 拆分服务共享的常量与对象存储 key 约定；不包含持久化或业务流程。

import type { GeneratedAppPreview } from '../../database/schema';

export const DEFAULT_PREVIEW: GeneratedAppPreview = {
  previewUrl: null,
  sourceArtifactUrl: null,
  testReportUrl: null,
};

export const GENERATED_APP_WORKFLOW_RUNTIME_METADATA_SOURCE =
  'generated-app-runtime-workflow';

/** 交付物内联读取上限；超过时只能看清单，不能经 API 读取内容 */
export const GENERATED_APP_ARTIFACT_INLINE_MAX_BYTES = 256 * 1024;

/**
 * 应用在对象存储中的根前缀（以 `/` 结尾）。Gate 3 工作区与 Gate 5 证据都写在
 * `<根前缀>runs/<generationRunId>/<gateId>/` 下，删除应用时整个根前缀一并清理（D-177）。
 */
export function buildGeneratedAppStoragePrefix(
  tenantId: string,
  appId: string,
): string {
  return `tenants/${tenantId}/generated-apps/${appId}/`;
}

/** 某次生成运行中某个 Gate 产物的对象存储前缀（不带结尾 `/`） */
export function buildGeneratedAppRunGatePrefix(
  tenantId: string,
  appId: string,
  generationRunId: string,
  gateId: 'gate-3' | 'gate-5',
): string {
  return `${buildGeneratedAppStoragePrefix(tenantId, appId)}runs/${generationRunId}/${gateId}`;
}
