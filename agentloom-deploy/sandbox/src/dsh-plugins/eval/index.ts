/**
 * agentloom-eval：VM 内置 Cordis 插件，提供 eval 工具——跨调用保持状态的 Python 内核，
 * cell 内可经 tool(name, **args) 回调 Agent 的其他工具、经 show(...) 返回图片。
 * 由 profile-writer 在 evalEnabled 且 terminalEnabled 时 insert（见 buildBuiltinPluginRows）。
 */
import { readFile } from 'node:fs/promises';
import type { Context } from '@deepseek-ai/cordis';
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment';
import type {} from '@deepseek-ai/dsh-llm';
import type {} from '@deepseek-ai/dsh-subprocess';
import type {} from '@deepseek-ai/dsh-system-prompt';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { capText } from '../shared/output-cap.js';
import {
  attachImages,
  createImageAttachmentHost,
  execModelRoute,
  renderTextWithImages,
  TEXT_WITH_IMAGES_OUTPUT_SCHEMA,
  type ImageInput,
  type TextWithImages,
} from '../shared/image-output.js';
import { EvalPluginConfig } from '../shared/plugin-config.js';
import { resolveWorkspacePath } from '../shared/workspace-path.js';
import { EvalKernel, type CellOutcome } from './kernel.js';
import { EvalToolBridge } from './tool-bridge.js';

export const name = 'agentloom-eval';
export const inject = ['tools', 'systemPrompt', 'subprocess', 'llm'];
export const Config = EvalPluginConfig;

export const EVAL_DEFAULT_TIMEOUT_SECONDS = 60;
export const EVAL_MAX_TIMEOUT_SECONDS = 600;
const ERROR_MAX_CHARS = 10_000;
const VALUE_MAX_CHARS = 20_000;
/** 单张图片上限（与远程工具图片通道一致） */
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

const PROMPT_SECTION =
  'Use eval for Python computations that need state across calls (variables persist in one kernel per session). ' +
  'Inside code, tool("name", **args) calls any other tool and returns its JSON value; ' +
  'show(fig_or_png_bytes_or_path) returns an image.';

const EVAL_DESCRIPTION = [
  'Run Python code in a persistent kernel (one per session; variables, imports and functions survive across calls).',
  'The value of a trailing expression is returned like a notebook cell; stdout/stderr are captured.',
  'Inside the code: tool("<tool name>", **args) calls another agent tool and returns its JSON value (raises ToolError on failure);',
  'show(obj) attaches an image (matplotlib figure, PIL image, PNG/JPEG bytes or an image file path).',
  'Long-running code is interrupted after `timeout` seconds; reset=true starts a fresh kernel.',
].join(' ');

export function apply(ctx: Context, config: EvalPluginConfig): void {
  const images = createImageAttachmentHost(ctx);
  const bridge = new EvalToolBridge(() => ctx.tools);
  const kernel = new EvalKernel({
    subprocess: () => ctx.subprocess,
    pythonPath: config.pythonPath,
    workdir: config.workdir,
    stateDir: config.stateDir,
    env: async () => {
      const endpoint = await bridge.endpoint();
      return { AGENTLOOM_EVAL_TOOL_URL: endpoint.url, AGENTLOOM_EVAL_TOOL_TOKEN: endpoint.token };
    },
  });

  ctx.systemPrompt.section({ name: 'tool:eval', order: 1050, text: PROMPT_SECTION });

  ctx.tools.register(
    defineTool({
      name: 'eval',
      description: EVAL_DESCRIPTION,
      parameters: {
        code: { type: 'string', required: true, description: 'Python source to execute.' },
        timeout: {
          type: 'integer',
          description: `Seconds before the cell is interrupted (1-${EVAL_MAX_TIMEOUT_SECONDS}, default ${EVAL_DEFAULT_TIMEOUT_SECONDS}).`,
        },
        reset: {
          type: 'boolean',
          description: 'Restart the kernel (dropping all state) before running the code. Default false.',
        },
      },
      output: {
        schema: TEXT_WITH_IMAGES_OUTPUT_SCHEMA,
        render: (_args, value) => renderTextWithImages(value),
      },
      isConcurrencySafe: () => false,
      execute: async (args, exec) => {
        const timeout = args.timeout ?? EVAL_DEFAULT_TIMEOUT_SECONDS;
        if (!Number.isInteger(timeout) || timeout < 1 || timeout > EVAL_MAX_TIMEOUT_SECONDS) {
          throw new Error(`timeout must be an integer between 1 and ${EVAL_MAX_TIMEOUT_SECONDS} seconds`);
        }
        if (args.reset === true) await kernel.reset();
        const outcome = await bridge.withExecution(exec, () => kernel.execute(args.code, timeout, exec.signal));
        const value: TextWithImages = { text: formatOutcome(outcome) };
        const attached = await attachImages(
          images,
          execModelRoute(exec),
          await loadImages(config.workdir, outcome.images),
        );
        if (attached) value.images = attached;
        return value;
      },
    }),
  );

  ctx.effect(async () => async () => {
    await kernel.dispose();
    await bridge.close();
  }, 'agentloom.eval');
}

/** 拼装模型可读的 cell 输出 */
export function formatOutcome(outcome: CellOutcome): string {
  const sections: string[] = [];
  if (outcome.restarted) sections.push('[kernel restarted — variables from earlier calls were lost]');
  if (outcome.stdout) sections.push(outcome.stdout.replace(/\n$/, ''));
  if (outcome.stderr) sections.push(`--- stderr ---\n${outcome.stderr.replace(/\n$/, '')}`);
  if (outcome.value !== undefined) sections.push(`--- value ---\n${capText(outcome.value, VALUE_MAX_CHARS, 'value')}`);
  if (!outcome.ok && outcome.error) sections.push(`--- error ---\n${capText(outcome.error, ERROR_MAX_CHARS, 'error')}`);
  if (outcome.images.length > 0) sections.push(`--- images ---\n${outcome.images.join('\n')}`);
  return sections.length > 0 ? sections.join('\n') : '(no output)';
}

/** 读取 show() 写出的图片；越出工作区、缺失、过大或非图片格式的条目跳过（路径仍在文本里） */
async function loadImages(workdir: string, paths: readonly string[]): Promise<ImageInput[]> {
  const loaded: ImageInput[] = [];
  for (const imagePath of paths) {
    try {
      const data = await readFile(resolveWorkspacePath(workdir, imagePath));
      const mediaType = sniffImageType(data);
      if (!mediaType || data.length > IMAGE_MAX_BYTES) continue;
      loaded.push({ data, mediaType, name: imagePath.slice(imagePath.lastIndexOf('/') + 1) });
    } catch {
      continue;
    }
  }
  return loaded;
}

function sniffImageType(data: Buffer): ImageMediaType | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  const head = data.subarray(0, 12).toString('latin1');
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}
