import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadPlugin } from './plugin';

const tempDirs: string[] = [];

function createPluginDirectory(source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'agentloom-plugin-cli-loader-'));
  tempDirs.push(root);
  mkdirSync(join(root, 'dist'));
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ type: 'module', main: './dist/index.js' })}\n`,
    'utf8',
  );
  writeFileSync(join(root, 'dist', 'index.js'), source, 'utf8');
  return root;
}

function pluginSource(nodes: string): string {
  return `export default {
  manifest: {
    id: 'com.agentloom.loader-fixture',
    name: 'Loader Fixture',
    version: '1.0.0',
    author: 'AgentLoom Team',
    description: 'Fixture used in plugin loader tests',
    license: 'MIT',
    minPlatformVersion: '1.0.0',
    permissions: [],
  },
  nodes: ${nodes},
  activate: async () => {},
  deactivate: async () => {},
};\n`;
}

function validNode(type: string): string {
  return `{
    type: '${type}',
    label: 'Fixture Node',
    category: 'utility',
    description: 'A valid fixture node',
    inputPorts: [],
    outputPorts: [],
    execute: async () => ({ outputs: {} }),
  }`;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const root = tempDirs.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('loadPlugin', () => {
  it('报告 malformed 节点的 index 与 type', async () => {
    const root = createPluginDirectory(
      pluginSource(`[{ type: 'broken-node', execute: async () => ({ outputs: {} }) }]`),
    );

    await expect(loadPlugin(root)).rejects.toThrow(/index=0, type=broken-node.*校验失败/s);
  });

  it('拒绝重复 node type 并报告重复项位置', async () => {
    const root = createPluginDirectory(
      pluginSource(`[${validNode('duplicate-node')}, ${validNode('duplicate-node')}]`),
    );

    await expect(loadPlugin(root)).rejects.toThrow(
      /index=1, type=duplicate-node.*重复 type/s,
    );
  });

  it('保留 manifest 与生命周期钩子并返回可执行节点', async () => {
    const root = createPluginDirectory(pluginSource(`[${validNode('valid-node')}]`));

    const plugin = await loadPlugin(root);

    expect(plugin.manifest.id).toBe('com.agentloom.loader-fixture');
    expect(plugin.nodes[0]?.type).toBe('valid-node');
    await expect(plugin.activate()).resolves.toBeUndefined();
    await expect(plugin.deactivate()).resolves.toBeUndefined();
  });
});
