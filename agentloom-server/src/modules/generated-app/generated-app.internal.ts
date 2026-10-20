// 本文件集中 Generated App 拆分服务共享的常量；不包含持久化或业务流程。

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
