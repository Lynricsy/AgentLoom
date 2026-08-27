import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  PORT_DATA_TYPES,
  PORT_DATA_TYPE_TRANSFORM_RULES,
} from '@agentloom/contracts';

import {
  isPortTypeCompatible,
  NodeTypeMismatchException,
  type TypeMismatchDetail,
} from '../execution.exceptions';

const TRANSFORM_PAIRS = new Set(
  PORT_DATA_TYPE_TRANSFORM_RULES.map(
    (rule) => `${rule.sourceKind}->${rule.targetKind}`,
  ),
);

describe('execution.exceptions', () => {
  describe('isPortTypeCompatible', () => {
    // 全 14×14 矩阵：执行期守卫必须与 contracts canonical 表逐格一致。
    for (const sourceType of PORT_DATA_TYPES) {
      for (const targetType of PORT_DATA_TYPES) {
        const expected =
          sourceType === targetType ||
          TRANSFORM_PAIRS.has(`${sourceType}->${targetType}`);

        it(`${sourceType} → ${targetType} 返回 ${expected}`, () => {
          expect(isPortTypeCompatible(sourceType, targetType)).toBe(expected);
        });
      }
    }

    it('非 text 源类型不再因目标是 json 而被通配放行', () => {
      const nonTextSources = PORT_DATA_TYPES.filter(
        (type) => type !== 'json' && type !== 'text',
      );

      for (const sourceType of nonTextSources) {
        expect(isPortTypeCompatible(sourceType, 'json')).toBe(false);
      }
    });
  });

  describe('NodeTypeMismatchException', () => {
    it('构造函数应设置 RFC7807 关键信息并保留 typeMismatch 明细', () => {
      const typeMismatch: TypeMismatchDetail = {
        sourcePortId: 'output-text',
        targetPortId: 'input-image',
        sourceType: 'text',
        targetType: 'image',
        sourceNodeId: 'node-source',
        targetNodeId: 'node-target',
        edgeId: 'edge-1',
      };

      const exception = new NodeTypeMismatchException(typeMismatch);

      expect(exception.type).toBe(
        'https://agentloom.dev/errors/node-type-mismatch',
      );
      expect(exception.message).toBe('端口类型不匹配');
      expect(exception.getResponse()).toBe('端口类型不匹配');
      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(exception.detail).toBe(
        '节点 node-source 的输出端口 "output-text" (text) 与节点 node-target 的输入端口 "input-image" (image) 类型不兼容',
      );
      expect(exception.typeMismatch).toEqual(typeMismatch);
    });
  });
});
