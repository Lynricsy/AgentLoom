import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  isPortTypeCompatible,
  NodeTypeMismatchException,
  type TypeMismatchDetail,
} from '../execution.exceptions';

const PORT_TYPES = [
  'string',
  'number',
  'boolean',
  'json',
  'image',
  'audio',
  'file',
  'model',
] as const;

describe('execution.exceptions', () => {
  describe('isPortTypeCompatible', () => {
    it.each(PORT_TYPES)('当源类型与目标类型同为 %s 时返回 true', (portType) => {
      expect(isPortTypeCompatible(portType, portType)).toBe(true);
    });

    it.each(PORT_TYPES)(
      '当目标类型为 json 时，无论源类型 %s 为何都返回 true',
      (sourceType) => {
        expect(isPortTypeCompatible(sourceType, 'json')).toBe(true);
      },
    );

    it.each([
      ['string', 'number'],
      ['number', 'boolean'],
      ['boolean', 'image'],
      ['json', 'audio'],
      ['image', 'file'],
      ['audio', 'model'],
      ['file', 'string'],
      ['model', 'boolean'],
    ])(
      '当源类型 %s 与目标类型 %s 不同且目标不是 json 时返回 false',
      (sourceType, targetType) => {
        expect(isPortTypeCompatible(sourceType, targetType)).toBe(false);
      },
    );
  });

  describe('NodeTypeMismatchException', () => {
    it('构造函数应设置 RFC7807 关键信息并保留 typeMismatch 明细', () => {
      const typeMismatch: TypeMismatchDetail = {
        sourcePortId: 'output-text',
        targetPortId: 'input-image',
        sourceType: 'string',
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
        '节点 node-source 的输出端口 "output-text" (string) 与节点 node-target 的输入端口 "input-image" (image) 类型不兼容',
      );
      expect(exception.typeMismatch).toEqual(typeMismatch);
    });
  });
});
