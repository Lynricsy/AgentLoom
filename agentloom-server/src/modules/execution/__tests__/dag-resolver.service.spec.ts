import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { DagResolverService } from '../dag-resolver.service';
import { CyclicGraphException } from '../execution.exceptions';
import type { ReactFlowNode, ReactFlowEdge } from '../../../database/schema';

function makeNode(id: string, type = 'agent'): ReactFlowNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function makeEdge(source: string, target: string): ReactFlowEdge {
  return { id: `${source}->${target}`, source, target };
}

describe('DagResolverService', () => {
  let service: DagResolverService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DagResolverService],
    }).compile();

    service = module.get(DagResolverService);
  });

  describe('resolveDag', () => {
    it('空图 → 返回空执行计划', () => {
      const plan = service.resolveDag([], []);

      expect(plan.layers).toEqual([]);
      expect(plan.adjacencyMap.size).toBe(0);
      expect(plan.inDegreeMap.size).toBe(0);
    });

    it('单节点 → 返回单层执行计划', () => {
      const nodes = [makeNode('a')];
      const plan = service.resolveDag(nodes, []);

      expect(plan.layers).toEqual([['a']]);
      expect(plan.adjacencyMap.get('a')).toEqual([]);
      expect(plan.inDegreeMap.get('a')).toBe(0);
    });

    it('线性链路 a→b→c → 三层顺序执行', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
      const plan = service.resolveDag(nodes, edges);

      expect(plan.layers).toEqual([['a'], ['b'], ['c']]);
      expect(plan.adjacencyMap.get('a')).toEqual(['b']);
      expect(plan.adjacencyMap.get('b')).toEqual(['c']);
      expect(plan.adjacencyMap.get('c')).toEqual([]);
      expect(plan.inDegreeMap.get('a')).toBe(0);
      expect(plan.inDegreeMap.get('b')).toBe(1);
      expect(plan.inDegreeMap.get('c')).toBe(1);
    });

    it('菱形 DAG → 并行层正确分组', () => {
      // a → b, a → c, b → d, c → d
      const nodes = [
        makeNode('a'),
        makeNode('b'),
        makeNode('c'),
        makeNode('d'),
      ];
      const edges = [
        makeEdge('a', 'b'),
        makeEdge('a', 'c'),
        makeEdge('b', 'd'),
        makeEdge('c', 'd'),
      ];
      const plan = service.resolveDag(nodes, edges);

      expect(plan.layers).toHaveLength(3);
      expect(plan.layers[0]).toEqual(['a']);
      expect(plan.layers[1]).toHaveLength(2);
      expect(plan.layers[1]).toEqual(expect.arrayContaining(['b', 'c']));
      expect(plan.layers[2]).toEqual(['d']);
    });

    it('多根节点 → 所有根节点在第一层', () => {
      // a → c, b → c
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('a', 'c'), makeEdge('b', 'c')];
      const plan = service.resolveDag(nodes, edges);

      expect(plan.layers).toHaveLength(2);
      expect(plan.layers[0]).toHaveLength(2);
      expect(plan.layers[0]).toEqual(expect.arrayContaining(['a', 'b']));
      expect(plan.layers[1]).toEqual(['c']);
    });

    it('断开的子图 → 独立根节点在同一层', () => {
      // a → b, c → d（两个独立子图）
      const nodes = [
        makeNode('a'),
        makeNode('b'),
        makeNode('c'),
        makeNode('d'),
      ];
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
      const plan = service.resolveDag(nodes, edges);

      expect(plan.layers).toHaveLength(2);
      expect(plan.layers[0]).toHaveLength(2);
      expect(plan.layers[0]).toEqual(expect.arrayContaining(['a', 'c']));
      expect(plan.layers[1]).toHaveLength(2);
      expect(plan.layers[1]).toEqual(expect.arrayContaining(['b', 'd']));
    });

    it('有环图 → 抛出 CyclicGraphException', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [
        makeEdge('a', 'b'),
        makeEdge('b', 'c'),
        makeEdge('c', 'a'),
      ];

      expect(() => service.resolveDag(nodes, edges)).toThrow(
        CyclicGraphException,
      );
    });

    it('自环 → 抛出 CyclicGraphException', () => {
      const nodes = [makeNode('a')];
      const edges = [makeEdge('a', 'a')];

      expect(() => service.resolveDag(nodes, edges)).toThrow(
        CyclicGraphException,
      );
    });

    it('复杂 DAG → 正确处理多层拓扑排序', () => {
      // a → b, a → c, b → d, c → d, d → e, a → e
      const nodes = [
        makeNode('a'),
        makeNode('b'),
        makeNode('c'),
        makeNode('d'),
        makeNode('e'),
      ];
      const edges = [
        makeEdge('a', 'b'),
        makeEdge('a', 'c'),
        makeEdge('b', 'd'),
        makeEdge('c', 'd'),
        makeEdge('d', 'e'),
        makeEdge('a', 'e'),
      ];
      const plan = service.resolveDag(nodes, edges);

      expect(plan.layers).toHaveLength(4);
      expect(plan.layers[0]).toEqual(['a']);
      expect(plan.layers[1]).toEqual(expect.arrayContaining(['b', 'c']));
      expect(plan.layers[2]).toEqual(['d']);
      expect(plan.layers[3]).toEqual(['e']);
    });

    it('仅孤立节点 → 所有节点在同一层', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const plan = service.resolveDag(nodes, []);

      expect(plan.layers).toHaveLength(1);
      expect(plan.layers[0]).toHaveLength(3);
      expect(plan.layers[0]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    });
  });
});
