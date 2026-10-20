import { describe, expect, it } from 'vitest';
import {
  redactBrowserText,
  redactRequestPath,
} from '../generated-app-browser-redaction.util';

const TOKEN = 'tok_abcdef123456';

describe('redactRequestPath', () => {
  it('Vite dev server 的 /@fs 宿主路径整体脱敏', () => {
    expect(
      redactRequestPath(
        'http://127.0.0.1:5175/@fs/root/Projects/app/node_modules/font.woff2?v=1',
        TOKEN,
        200,
      ),
    ).toBe('<path>');
  });

  it('普通 API 路径保留，仅替换验收令牌并去掉查询串', () => {
    expect(
      redactRequestPath(
        `http://127.0.0.1:5175/api/v1/generated-apps/public/${TOKEN}/submissions?x=1`,
        TOKEN,
        200,
      ),
    ).toBe('/api/v1/generated-apps/public/<acceptance-token>/submissions');
  });
});

describe('redactBrowserText', () => {
  it('console 文本里的 /@fs 宿主路径同样脱敏', () => {
    expect(
      redactBrowserText(
        'Failed to load resource: /@fs/root/Projects/app/font.woff2 403',
        TOKEN,
        200,
      ),
    ).toBe('Failed to load resource: <path> 403');
  });
});
