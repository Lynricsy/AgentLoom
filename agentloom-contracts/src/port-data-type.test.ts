import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PORT_DATA_TYPES } from './port-data-type';

/**
 * 机械同步闸门：读取其他端的源文件文本提取端口类型取值集合，
 * 断言各端都 ⊆ contracts 全集，且 contracts 全集 = 各端并集（无凭空多出的值）。
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function extractQuotedLiterals(body: string): string[] {
  return [...body.matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
}

/** 从 `pub enum PortDataType { ... }` 提取 Rust 变体并转为 serde lowercase 取值。 */
function extractRustPortDataTypes(): string[] {
  const source = read('agentloom-type-engine/src/types/port.rs');
  const body = /pub enum PortDataType\s*\{([^}]*)\}/.exec(source)?.[1];
  if (!body) throw new Error('未能在 port.rs 中定位 PortDataType 枚举');

  return body
    .replace(/\/\/.*$/gm, '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((variant) => variant.toLowerCase());
}

/** 从 plugin-sdk 的 `portDataTypes` 常量数组提取字面量取值。 */
function extractSdkPortDataTypes(): string[] {
  const source = read('agentloom-plugin-sdk/src/types/port.ts');
  const body = /const portDataTypes = \[([^\]]*)\]/.exec(source)?.[1];
  if (!body) throw new Error('未能在 plugin-sdk port.ts 中定位 portDataTypes');

  return extractQuotedLiterals(body);
}

/** 从 studio 的 `PORT_DATA_TYPES` 常量数组提取字面量取值。 */
function extractStudioPortDataTypes(): string[] {
  const source = read(
    'agentloom-studio/src/features/canvas/types/typeSchema.ts',
  );
  const body = /export const PORT_DATA_TYPES = \[([^\]]*)\]/.exec(source)?.[1];
  if (!body) {
    throw new Error('未能在 studio typeSchema.ts 中定位 PORT_DATA_TYPES');
  }

  return extractQuotedLiterals(body);
}

/** 从 server 的 workflow graph 归一化工具提取 PortDataType 联合取值。 */
function extractServerPortDataTypes(): string[] {
  const source = read(
    'agentloom-server/src/modules/workflow-definition/utils/normalize-workflow-graph.utils.ts',
  );
  const body = /type PortDataType =([\s\S]*?);/.exec(source)?.[1];
  if (!body) throw new Error('未能在 server 归一化工具中定位 PortDataType');

  return extractQuotedLiterals(body);
}

const SOURCES: Record<string, () => string[]> = {
  'type-engine (port.rs)': extractRustPortDataTypes,
  'plugin-sdk (port.ts)': extractSdkPortDataTypes,
  'studio (typeSchema.ts)': extractStudioPortDataTypes,
  'server (normalize-workflow-graph.utils.ts)': extractServerPortDataTypes,
};

describe('PortDataType 跨端同步', () => {
  const canonical = new Set<string>(PORT_DATA_TYPES);

  it('contracts 全集内无重复值', () => {
    expect(canonical.size).toBe(PORT_DATA_TYPES.length);
  });

  for (const [label, extract] of Object.entries(SOURCES)) {
    it(`${label} 的取值集合是 contracts 全集的子集`, () => {
      const values = extract();

      expect(values.length).toBeGreaterThan(0);
      expect(values.filter((value) => !canonical.has(value))).toEqual([]);
    });
  }

  it('contracts 全集恰好等于各端取值的并集', () => {
    const union = new Set<string>();
    for (const extract of Object.values(SOURCES)) {
      for (const value of extract()) union.add(value);
    }

    expect([...canonical].sort()).toEqual([...union].sort());
  });
});
