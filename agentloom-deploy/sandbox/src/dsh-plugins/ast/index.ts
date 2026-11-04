/**
 * agentloom-ast：VM 内置 Cordis 插件，提供 ast_grep（结构化搜索）与 ast_edit
 * （结构化批量改写）。由 profile-writer 按原生工具策略 astEnabled 插入；
 * 写盘受 editEnabled（config.allowEdits）约束。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-system-prompt';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { EditablePluginConfig } from '../shared/plugin-config.js';
import { runAstEdit } from './edit.js';
import { AST_LANGUAGES } from './languages.js';
import { runAstGrep } from './search.js';

export const name = 'agentloom-ast';
export const inject = ['tools', 'systemPrompt'];
export const Config = EditablePluginConfig;

/** 紧跟 TOOL_LSP(2200) 之后 */
const AST_SECTION_ORDER = 2250;

const LANG_PARAMETER = {
  type: 'string',
  enum: AST_LANGUAGES,
  description: 'Language of the sources. Omit to infer from file extensions.',
} as const;

const INCLUDE_PARAMETER = {
  type: 'string',
  description:
    'Glob filter for directory mode, e.g. "*.ts" (matched against file names) or "src/**/*.py" (matched against paths relative to path).',
} as const;

const textOutput = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
} as const;

export function apply(ctx: Context, config: EditablePluginConfig): void {
  ctx.systemPrompt.section({
    name: 'tool:ast',
    order: AST_SECTION_ORDER,
    text: 'Use ast_grep for structural code search (pattern syntax: code with $NAME metavariables, $$$ for sequences) and ast_edit for codemods; ast_edit defaults to dry_run=true, re-run with dry_run=false to apply.',
  });

  ctx.tools.register(
    defineTool({
      name: 'ast_grep',
      description:
        'Structural code search with ast-grep. The pattern is source code in the target language where $NAME matches one node and $$$NAME matches a sequence of nodes (e.g. "console.log($$$ARGS)", "def $F($$$P): $$$B"). Searches one file or a directory tree (skipping node_modules, .git, dist, build, target, .venv, __pycache__).',
      parameters: {
        pattern: { type: 'string', required: true, description: 'ast-grep pattern.' },
        path: {
          type: 'string',
          description: 'File or directory to search, relative to the workspace. Defaults to the workspace root.',
        },
        lang: LANG_PARAMETER,
        include: INCLUDE_PARAMETER,
        limit: {
          type: 'integer',
          description: 'Maximum matches to return (1-500). Defaults to 100.',
        },
      },
      output: textOutput,
      isConcurrencySafe: () => true,
      execute: (args) => runAstGrep(config.workdir, args),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'ast_edit',
      description:
        'Structural rewrite with ast-grep: every node matching pattern is replaced by rewrite, where $NAME / $$$NAME in rewrite expand to the matched text. Defaults to dry_run=true (preview only); re-run with dry_run=false to write the files.',
      parameters: {
        pattern: { type: 'string', required: true, description: 'ast-grep pattern to match.' },
        rewrite: {
          type: 'string',
          required: true,
          description: 'Replacement code; may reference metavariables from the pattern.',
        },
        path: {
          type: 'string',
          required: true,
          description: 'File or directory to rewrite, relative to the workspace.',
        },
        lang: LANG_PARAMETER,
        include: INCLUDE_PARAMETER,
        dry_run: {
          type: 'boolean',
          description: 'Preview without writing. Defaults to true.',
        },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      execute: (args) => runAstEdit(config.workdir, config.allowEdits, args),
    }),
  );
}
