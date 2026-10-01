import { NODE_CATEGORIES } from '../../../agentloom-studio/src/features/canvas/components/nodeCategories';
import {
  DYNAMIC_ONLY_NODE_TYPES,
  NODE_TYPE_REGISTRY,
  NODE_TYPES,
  PORT_DATA_TYPE_META,
  type NodeConfigFieldSchema,
  type PortDefinition,
} from '../../../agentloom-studio/src/features/canvas/types/nodeTypeRegistry';
import { PORT_DATA_TYPE_TRANSFORM_RULES, isPortDataTypeCompatible } from '../../../agentloom-contracts/src/port-compatibility';
import { PORT_DATA_TYPES } from '../../../agentloom-contracts/src/port-data-type';
import { type Artifact, cell, code, doc, table } from '../lib';

export { NODE_TYPES };

function portTable(ports: PortDefinition[]): string {
  if (ports.length === 0) return '无。';
  return table(
    ['端口 ID', '名称', '数据类型', '必填', '多连接', '说明'],
    ports.map((p) => [
      code(p.id),
      cell(p.label),
      code(p.acceptsAnyDataType ? `${p.dataType}（接受任意类型）` : p.dataType),
      p.required ? '是' : '',
      p.multiple ? (p.maxConnections === null ? '不限' : `最多 ${p.maxConnections}`) : '',
      cell(p.description),
    ]),
  );
}

/** 配置项展开一层嵌套对象：父键.子键 */
function configRows(
  properties: Record<string, NodeConfigFieldSchema>,
  required: string[],
  prefix = '',
): string[][] {
  return Object.entries(properties).flatMap(([key, field]) => {
    const row = [
      code(prefix + key),
      cell(field.title),
      code(field.type),
      field.default === undefined ? '' : code(JSON.stringify(field.default)),
      required.includes(key) ? '是' : '',
      [cell(field.description), field.enum ? `取值：${field.enum.map(code).join(' / ')}` : '']
        .filter(Boolean)
        .join(' '),
    ];
    const nested =
      field.type === 'object' && field.properties && prefix === ''
        ? configRows(field.properties, field.required ?? [], `${key}.`)
        : [];
    return [row, ...nested];
  });
}

export function nodeArtifacts(): Artifact[] {
  const summary = table(
    ['类型', '名称', '分类', '说明', '节点面板可见'],
    NODE_TYPES.map((t) => {
      const n = NODE_TYPE_REGISTRY[t];
      const visible = !DYNAMIC_ONLY_NODE_TYPES.has(t) || t === 'merge';
      return [code(t), cell(n.label), cell(NODE_CATEGORIES[n.category].label), cell(n.description), visible ? '是' : '否'];
    }),
  );
  const perNode = NODE_TYPES.map((t): Artifact => {
    const n = NODE_TYPE_REGISTRY[t];
    const props = n.configSchema.properties;
    const config =
      Object.keys(props).length === 0
        ? '无静态配置项。'
        : table(['配置键', '名称', '类型', '默认值', '必填', '说明'], configRows(props, n.configSchema.required));
    return {
      path: `nodes/${t}.md`,
      content: doc(
        `类型 ${code(t)}，分类 ${NODE_CATEGORIES[n.category].label}。来源：\`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts\`。`,
        '**输入端口**',
        portTable(n.inputPorts),
        '**输出端口**',
        portTable(n.outputPorts),
        '**配置项**',
        config,
      ),
    };
  });
  return [
    {
      path: 'node-types.md',
      content: doc(
        '来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts` 的 `NODE_TYPES` / `NODE_TYPE_REGISTRY`；分类名取自 `nodeCategories.ts` 的 `NODE_CATEGORIES`。「节点面板可见」为否的类型只由画布动态创建（如循环体内部节点、可复用块、插件节点）。',
        summary,
      ),
    },
    ...perNode,
  ];
}

export function portDataTypesArtifact(): Artifact {
  const types = [...PORT_DATA_TYPES];
  const ruleFor = (a: string, b: string) =>
    PORT_DATA_TYPE_TRANSFORM_RULES.find((r) => r.sourceKind === a && r.targetKind === b);
  const matrix = table(
    ['源 \\ 目标', ...types.map(code)],
    types.map((src) => [
      code(src),
      ...types.map((dst) => {
        if (src === dst) return '✓';
        if (!isPortDataTypeCompatible(src, dst)) return '';
        return `可连（${ruleFor(src, dst)?.transformFn ?? '?'}）`;
      }),
    ]),
  );
  return {
    path: 'port-data-types.md',
    content: doc(
      '来源：`agentloom-contracts/src/port-data-type.ts` 的 `PORT_DATA_TYPES`；显示名与端口形状取自 Studio `PORT_DATA_TYPE_META`。',
      table(
        ['值', '显示名', '端口形状'],
        types.map((t) => [code(t), cell(PORT_DATA_TYPE_META[t].label), code(PORT_DATA_TYPE_META[t].shape)]),
      ),
      '**dataType 兼容矩阵**（来源 `agentloom-contracts/src/port-compatibility.ts` 的 `isPortDataTypeCompatible`；✓ 同类型直连，「可连」为跨类型变换规则允许的连线，空白为不兼容。exec / volume / memory 的专有连线约束与 schema 深层比对不在此表内）：',
      matrix,
      '**跨类型变换规则**（`PORT_DATA_TYPE_TRANSFORM_RULES`，与 type-engine 同步）。server 执行期只用这张表校验连线是否合法，不执行其中的变换函数，下游节点收到的是上游原值：',
      table(
        ['源类型', '目标类型', '变换函数', '原因键'],
        PORT_DATA_TYPE_TRANSFORM_RULES.map((r) => [code(r.sourceKind), code(r.targetKind), code(r.transformFn), code(r.reasonKey)]),
      ),
    ),
  };
}
