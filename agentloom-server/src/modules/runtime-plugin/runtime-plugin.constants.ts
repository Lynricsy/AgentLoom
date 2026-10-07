/** 平台当前支持的 `@deepseek-ai/dsh` 版本；runtime 插件 manifest.runtime.dshVersion 必须精确相等。 */
export const RUNTIME_PLUGIN_SUPPORTED_DSH_VERSION = '0.2.0-rc.2';

/** runtime 插件 .alp 包大小上限（50 MiB），与节点插件一致。 */
export const MAX_RUNTIME_PLUGIN_FILE_SIZE = 50 * 1024 * 1024;

/** npm 包名（可带 @scope）校验正则，用于 source=npm 的 runtime 插件引用。 */
export const RUNTIME_PLUGIN_NPM_NAME_PATTERN =
  /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** npm 包名最大长度（npm registry 限制）。 */
export const RUNTIME_PLUGIN_NPM_SPEC_MAX = 214;
