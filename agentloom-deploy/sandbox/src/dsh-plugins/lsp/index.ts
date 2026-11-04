/**
 * agentloom-lsp：VM 内置 dsh 插件，提供 `lsp` 工具（诊断 / 定义 / 引用 / hover /
 * 符号 / 重命名 / code action），并在 write / edit / str_replace_editor 成功后
 * 自动附带该文件的新诊断。语言服务器经 ctx.subprocess 按需启动、空闲关闭。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-subprocess';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import { EditablePluginConfig } from '../shared/plugin-config.js';
import { registerWriteDiagnostics } from './diagnostics.js';
import { LspServerPool } from './servers.js';
import { createLspTool } from './tool.js';

export const name = 'agentloom-lsp';
export const inject = ['tools', 'systemPrompt', 'subprocess'];
export const Config = EditablePluginConfig;

export function apply(ctx: Context, config: EditablePluginConfig): void {
  const warn = (message: string) => ctx.logger.warn(`agentloom-lsp: ${message}`);
  const pool = new LspServerPool(ctx.subprocess, config.workdir, warn);
  ctx.effect(() => () => pool.dispose(), 'agentloom.lsp.servers');

  ctx.systemPrompt.section({
    name: 'tool:lsp',
    order: ctx.systemPrompt.getSectionOrder('TOOL_LSP'),
    text: 'Use the lsp tool for diagnostics, go-to-definition, references, hover types and renames instead of inferring them from grep; successful write/edit results already include fresh diagnostics for that file.',
  });
  ctx.tools.register(createLspTool({ pool, workdir: config.workdir, allowEdits: config.allowEdits }));
  registerWriteDiagnostics(ctx, pool, config.workdir, warn);
}
