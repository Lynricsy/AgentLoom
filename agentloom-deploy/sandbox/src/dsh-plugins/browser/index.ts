/**
 * agentloom-browser：VM 内置 Cordis 插件，提供 browser 工具（puppeteer-core 驱动
 * 无头 Chromium）。由 profile-writer 按原生工具策略 browserEnabled 插入。
 * 截图在模型接受图像且 attachments 服务已挂载时以 image block 回给模型，否则只回文件路径。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-system-prompt';
import { defineTool } from '@deepseek-ai/dsh-tools';
import {
  attachImages,
  createImageAttachmentHost,
  execModelRoute,
  renderTextWithImages,
  TEXT_WITH_IMAGES_OUTPUT_SCHEMA,
  type TextWithImages,
} from '../shared/image-output.js';
import { BrowserPluginConfig } from '../shared/plugin-config.js';
import { BROWSER_ACTIONS, runBrowserAction, WAIT_UNTIL_VALUES } from './actions.js';
import { BrowserSession } from './session.js';

export const name = 'agentloom-browser';
export const inject = ['tools', 'systemPrompt', 'llm'];
export const Config = BrowserPluginConfig;

export function apply(ctx: Context, config: BrowserPluginConfig): void {
  const session = new BrowserSession(config);
  const images = createImageAttachmentHost(ctx);

  ctx.effect(() => () => session.close(), 'agentloom.browser');

  ctx.systemPrompt.section({
    name: 'tool:browser',
    order: ctx.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE'),
    text: 'Use the browser tool to open pages, read them via snapshot/text, interact (click/type/press) and verify web UIs you build (localhost URLs are allowed); screenshot returns an image when the model accepts images.',
  });

  ctx.tools.register(
    defineTool({
      name: 'browser',
      description:
        'Drive a headless Chromium inside the sandbox. Start with action "open" (optionally with url) to get a tab id such as "t1", then pass that tab to goto/click/type/press/wait/text/snapshot/screenshot/evaluate/close. "tabs" lists open tabs; "close" without tab closes the browser. Page errors (timeouts, missing selectors, failed navigation) come back as "error: …" text.',
      parameters: {
        action: { type: 'string', required: true, enum: BROWSER_ACTIONS },
        tab: {
          type: 'string',
          description: 'Tab id returned by "open". Required for every action except open and tabs.',
        },
        url: {
          type: 'string',
          description: 'http(s) or data: URL. Optional for open, required for goto.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector. Required for click and type; optional for text and wait.',
        },
        text: { type: 'string', description: 'Text to type (action "type").' },
        clear: {
          type: 'boolean',
          description: 'Clear the field before typing. Defaults to false.',
        },
        key: {
          type: 'string',
          description: 'Key to press, e.g. "Enter", "Tab", "ArrowDown" (action "press").',
        },
        expression: {
          type: 'string',
          description: 'JavaScript expression evaluated in the page; its JSON value is returned (action "evaluate").',
        },
        wait_until: {
          type: 'string',
          enum: WAIT_UNTIL_VALUES,
          description: 'Navigation completion event for open/goto. Defaults to "load".',
        },
        timeout_ms: {
          type: 'integer',
          description: 'Per-action timeout in milliseconds (1000-60000). Defaults to 15000.',
        },
        full_page: {
          type: 'boolean',
          description: 'Capture the full scrollable page (action "screenshot"). Defaults to false.',
        },
      },
      output: {
        schema: TEXT_WITH_IMAGES_OUTPUT_SCHEMA,
        render: (_args, value) => renderTextWithImages(value),
      },
      async execute(args, exec): Promise<TextWithImages> {
        const result = await runBrowserAction(session, config.workdir, args);
        if (!result.screenshot) return { text: result.text };
        const attached = await attachImages(images, execModelRoute(exec), [
          {
            data: result.screenshot.data,
            mediaType: 'image/png',
            name: result.screenshot.path.split('/').at(-1),
          },
        ]);
        return attached ? { text: result.text, images: attached } : { text: result.text };
      },
    }),
  );
}
