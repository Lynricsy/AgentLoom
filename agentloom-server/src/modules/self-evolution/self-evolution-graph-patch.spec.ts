/** 验证图补丁模块无需构造 facade 即可独立使用。 */
import { describe, expect, it, vi } from 'vitest';

import { SelfEvolutionGraphPatch } from './self-evolution-graph-patch';

describe('SelfEvolutionGraphPatch', () => {
  it('独立应用节点补丁且不修改输入图', () => {
    const graphPatch = new SelfEvolutionGraphPatch(
      { listTools: vi.fn() } as unknown as ConstructorParameters<
        typeof SelfEvolutionGraphPatch
      >[0],
    );
    const nodes = [{ id: 'node-1', data: { config: { a: 1 } } }];

    const result = graphPatch.applyNodes(nodes, [
      {
        op: 'update',
        nodeId: 'node-1',
        patch: { data: { config: { b: 2 } } },
      },
    ]);

    expect(result).toEqual([
      { id: 'node-1', data: { config: { a: 1, b: 2 } } },
    ]);
    expect(nodes).toEqual([{ id: 'node-1', data: { config: { a: 1 } } }]);
  });
});
