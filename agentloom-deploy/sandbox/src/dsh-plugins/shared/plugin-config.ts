/**
 * 内置插件（agentloom-lsp/ast/browser/eval）共用的配置 schema。插件条目由
 * profile-writer 的 buildBuiltinPluginRows 生成，字段与那里的 config 字面量一一对应。
 */
import Schema from '@deepseek-ai/schemastery';

/** lsp / ast：改写类动作受原生工具策略 editEnabled 约束 */
export interface EditablePluginConfig {
  /** 会话工作目录（/workspace 下） */
  workdir: string;
  /** 是否允许把改写写回磁盘 */
  allowEdits: boolean;
}

export const EditablePluginConfig: Schema<EditablePluginConfig> = Schema.object({
  workdir: Schema.string().required(),
  allowEdits: Schema.boolean().default(true),
});

export interface BrowserPluginConfig {
  workdir: string;
  /** 会话私有状态目录（Chromium profile） */
  stateDir: string;
  /** Chromium 可执行文件绝对路径 */
  chromiumPath: string;
}

export const BrowserPluginConfig: Schema<BrowserPluginConfig> = Schema.object({
  workdir: Schema.string().required(),
  stateDir: Schema.string().required(),
  chromiumPath: Schema.string().required(),
});

export interface EvalPluginConfig {
  workdir: string;
  /** 会话私有状态目录（runner.py） */
  stateDir: string;
  /** Python 解释器（PATH 上的名字或绝对路径） */
  pythonPath: string;
}

export const EvalPluginConfig: Schema<EvalPluginConfig> = Schema.object({
  workdir: Schema.string().required(),
  stateDir: Schema.string().required(),
  pythonPath: Schema.string().required(),
});
