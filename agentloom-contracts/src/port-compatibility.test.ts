import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PORT_DATA_TYPES } from './port-data-type';
import {
  PORT_DATA_TYPE_TRANSFORM_RULES,
  isPortDataTypeCompatible,
} from './port-compatibility';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * 从 Rust `CompatibilityChecker::default()` 的 `transform_rules` 提取有序规则表。
 * 权威实现在 Rust 侧，contracts 只是它的 wire 镜像。
 */
function extractRustTransformRules(): Array<{
  sourceKind: string;
  targetKind: string;
  reasonKey: string;
  transformFn: string;
}> {
  const source = read('agentloom-type-engine/src/checker/compatibility.rs');
  const body = /transform_rules:\s*vec!\[([\s\S]*?)\n\s*\],/.exec(source)?.[1];
  if (!body) {
    throw new Error('未能在 compatibility.rs 中定位 transform_rules');
  }

  const pattern =
    /TransformRule\s*\{\s*source_kind:\s*PortDataType::(\w+)\s*,\s*target_kind:\s*PortDataType::(\w+)\s*,\s*reason_key:\s*"([^"]+)"\s*,\s*transform_fn:\s*"([^"]+)"\s*,?\s*\}/g;

  return [...body.matchAll(pattern)].map((match) => ({
    sourceKind: match[1].toLowerCase(),
    targetKind: match[2].toLowerCase(),
    reasonKey: match[3],
    transformFn: match[4],
  }));
}

describe('端口类型变换规则', () => {
  it('与 type-engine Rust 权威表逐条相等（含顺序与元数据）', () => {
    const rustRules = extractRustTransformRules();

    expect(rustRules.length).toBeGreaterThan(0);
    expect(rustRules).toEqual(
      PORT_DATA_TYPE_TRANSFORM_RULES.map((rule) => ({
        sourceKind: rule.sourceKind,
        targetKind: rule.targetKind,
        reasonKey: rule.reasonKey,
        transformFn: rule.transformFn,
      })),
    );
  });

  it('规则的两端类型都属于 contracts 端口类型全集', () => {
    const canonical = new Set<string>(PORT_DATA_TYPES);

    for (const rule of PORT_DATA_TYPE_TRANSFORM_RULES) {
      expect(canonical.has(rule.sourceKind)).toBe(true);
      expect(canonical.has(rule.targetKind)).toBe(true);
    }
  });
});

describe('isPortDataTypeCompatible 全矩阵', () => {
  const transformPairs = new Set(
    PORT_DATA_TYPE_TRANSFORM_RULES.map(
      (rule) => `${rule.sourceKind}->${rule.targetKind}`,
    ),
  );

  for (const sourceType of PORT_DATA_TYPES) {
    for (const targetType of PORT_DATA_TYPES) {
      const expected =
        sourceType === targetType ||
        transformPairs.has(`${sourceType}->${targetType}`);

      it(`${sourceType} -> ${targetType} 为 ${expected}`, () => {
        expect(isPortDataTypeCompatible(sourceType, targetType)).toBe(expected);
      });
    }
  }

  it('非 text/json 的任意类型都不能连进 json 端口（删除 server 侧 json 通配）', () => {
    const nonTextSources = PORT_DATA_TYPES.filter(
      (type) => type !== 'json' && type !== 'text',
    );

    for (const sourceType of nonTextSources) {
      expect(isPortDataTypeCompatible(sourceType, 'json')).toBe(false);
    }
  });

  it('json 与 array 之间双向不兼容（删除 Studio 侧粗粒度多余规则）', () => {
    expect(isPortDataTypeCompatible('json', 'array')).toBe(false);
    expect(isPortDataTypeCompatible('array', 'json')).toBe(false);
  });

  it('未知类型字面量不被误判为兼容', () => {
    expect(isPortDataTypeCompatible('not-a-type', 'json')).toBe(false);
    expect(isPortDataTypeCompatible('text', 'not-a-type')).toBe(false);
  });
});
