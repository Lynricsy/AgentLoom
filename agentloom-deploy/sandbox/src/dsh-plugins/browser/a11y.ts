/**
 * 把 puppeteer 的无障碍树快照扁平化为缩进文本：每个节点一行
 * `role "name" [value] (state, …)`，子节点多缩进两格。无名称的 generic / none
 * 容器不单独成行，其子节点上提一层，减少噪声。
 */
import type { SerializedAXNode } from 'puppeteer-core';

/** 以括号标注的布尔 / 枚举状态 */
const STATE_KEYS = [
  'focused',
  'disabled',
  'checked',
  'pressed',
  'selected',
  'expanded',
  'required',
  'readonly',
] as const;

function describeNode(node: SerializedAXNode): string {
  const parts = [node.role];
  if (node.name) parts.push(JSON.stringify(node.name));
  if (node.value !== undefined && node.value !== '') parts.push(`[${node.value}]`);
  const states: string[] = [];
  if (node.level !== undefined) states.push(`level ${node.level}`);
  for (const key of STATE_KEYS) {
    const state = node[key];
    if (state === true) states.push(key);
    else if (state === 'mixed') states.push(`${key}: mixed`);
  }
  if (node.url) states.push(node.url);
  if (states.length > 0) parts.push(`(${states.join(', ')})`);
  return parts.join(' ');
}

export function formatAccessibilityTree(root: SerializedAXNode | null): string {
  if (!root) return '(empty accessibility tree)';
  const lines: string[] = [];
  const visit = (node: SerializedAXNode, depth: number): void => {
    const transparent = (node.role === 'generic' || node.role === 'none') && !node.name;
    if (!transparent) lines.push(`${'  '.repeat(depth)}${describeNode(node)}`);
    for (const child of node.children ?? []) visit(child, transparent ? depth : depth + 1);
  };
  visit(root, 0);
  return lines.join('\n');
}
