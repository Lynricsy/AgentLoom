import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 机械同步闸门（D-10 回归）：沙箱远程工具回调令牌的 HTTP 头名跨三端一致。
 *
 * 链路是 guest（pi-coding-agent 扩展）→ firecracker relay（Go runtime-manager）
 * → server（NestJS controller）。三端任一处写错头名，工具回调都会在 relay 入站校验
 * 或 server 参数绑定处静默失败（403 / token undefined），而各端自己的单测都发现不了。
 * 这里直接读源文件文本提取头名，任何一端改动都会让本用例变红。
 */

const CANONICAL_CALLBACK_TOKEN_HEADER = 'x-agentloom-sandbox-session-token';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** guest：`REMOTE_TOOL_CALLBACK_TOKEN_HEADER` 常量。 */
function extractGuestHeaders(): string[] {
  const source = read('agentloom-deploy/sandbox/src/remote-tools.ts');
  const matches = [
    ...source.matchAll(
      /REMOTE_TOOL_CALLBACK_TOKEN_HEADER\s*=\s*['"]([^'"]+)['"]/g,
    ),
  ];

  return matches.map((match) => match[1]);
}

/** server：agent-runtime controller 上绑定回调令牌的 `@Headers(...)` 装饰器。 */
function extractServerHeaders(): string[] {
  const source = read(
    'agentloom-server/src/modules/agent/agent-runtime.controller.ts',
  );
  const matches = [...source.matchAll(/@Headers\(\s*['"]([^'"]+)['"]\s*\)/g)];

  return matches.map((match) => match[1]);
}

/** Go relay：`callbackTokenHeader` 常量（入站校验与上游转发共用）。 */
function extractGoHeaders(): string[] {
  const source = read('agentloom-firecracker-runtime/internal/api/proxy.go');
  const matches = [
    ...source.matchAll(/callbackTokenHeader\s*=\s*"([^"]+)"/g),
  ];

  return matches.map((match) => match[1]);
}

const SOURCES: Record<string, () => string[]> = {
  'guest (remote-tools.ts)': extractGuestHeaders,
  'server (agent-runtime.controller.ts)': extractServerHeaders,
  'relay (proxy.go)': extractGoHeaders,
};

describe('沙箱回调令牌头名跨端同步', () => {
  for (const [label, extract] of Object.entries(SOURCES)) {
    it(`${label} 使用 canonical 头名`, () => {
      const headers = extract();

      expect(headers.length).toBeGreaterThan(0);
      // HTTP 头名大小写不敏感，比较前统一小写。
      expect([
        ...new Set(headers.map((header) => header.toLowerCase())),
      ]).toEqual([CANONICAL_CALLBACK_TOKEN_HEADER]);
    });
  }

  it('Go relay 的入站校验与上游转发共用同一个常量，且不残留旧头名', () => {
    const source = read('agentloom-firecracker-runtime/internal/api/proxy.go');

    expect(source).toContain('callbackTokenAuthorized');
    expect(source).toContain('applyCallbackToken');
    expect(source.toLowerCase()).not.toContain('x-agentloom-callback-token');
  });
});
