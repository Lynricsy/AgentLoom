import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../../database/schema';

/** 快照缺尺寸（未经画布测量）的节点按常见节点卡大小兜底 */
const DEFAULT_NODE_WIDTH = 240;
const DEFAULT_NODE_HEIGHT = 160;

/**
 * 市场卡片缩略图的单个节点：画布绝对坐标下的包围盒。
 * 只下发几何与着色所需字段，不带节点配置（提示词、URL、密钥引用等）。
 */
export interface MarketplacePreviewGraphNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category: string | null;
  nodeType: string | null;
}

export interface MarketplacePreviewGraphEdge {
  source: string;
  target: string;
}

/** 节点按嵌套深度排序（容器在前），前端按顺序绘制即可让容器垫在子节点下面 */
export interface MarketplacePreviewGraph {
  nodes: MarketplacePreviewGraphNode[];
  edges: MarketplacePreviewGraphEdge[];
}

/**
 * 在数据库侧把 workflow_versions.snapshot 投影成缩略图原料，
 * 避免列表页把整份快照（含全部节点配置）读进内存。
 *
 * 快照来自画布原样保存，键名可能是 camelCase 也可能是 snake_case（如 parent_id），
 * 且 nodes/edges 不保证是数组，所以这里只做容错投影，数值与引用校验交给
 * {@link buildMarketplacePreviewGraph}。
 */
export function selectMarketplacePreviewGraphSource(): SQL<unknown> {
  const snapshot = schema.workflowVersions.snapshot;
  // `"parentId": null` 这类显式 null 不能挡住 snake_case 的备选键
  const firstPresent = (primary: SQL, fallback: SQL) =>
    sql`coalesce(nullif(${primary}, 'null'::jsonb), ${fallback})`;

  return sql<unknown>`case when ${snapshot} is null then null else jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n -> 'id',
        'x', n #> '{position,x}',
        'y', n #> '{position,y}',
        'width', ${firstPresent(sql`n #> '{measured,width}'`, sql`n -> 'width'`)},
        'height', ${firstPresent(sql`n #> '{measured,height}'`, sql`n -> 'height'`)},
        'category', ${firstPresent(sql`n -> 'type'`, sql`n #> '{data,category}'`)},
        'nodeType', ${firstPresent(sql`n #> '{data,nodeType}'`, sql`n #> '{data,node_type}'`)},
        'parentId', ${firstPresent(sql`n -> 'parentId'`, sql`n -> 'parent_id'`)}
      ) order by ord)
      from jsonb_array_elements(
        case when jsonb_typeof(${snapshot} -> 'nodes') = 'array' then ${snapshot} -> 'nodes' else '[]'::jsonb end
      ) with ordinality as preview_nodes(n, ord)
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', e -> 'source',
        'target', e -> 'target'
      ) order by ord)
      from jsonb_array_elements(
        case when jsonb_typeof(${snapshot} -> 'edges') = 'array' then ${snapshot} -> 'edges' else '[]'::jsonb end
      ) with ordinality as preview_edges(e, ord)
    ), '[]'::jsonb)
  ) end`;
}

const OptionalTextSchema = z.string().min(1).nullable().catch(null);

/** 单个节点坏字段就地兜底；只有缺 id 的节点无法被连线引用，才整个丢弃 */
const PreviewSourceNodeSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite().catch(0),
  y: z.number().finite().catch(0),
  width: z.number().finite().positive().catch(DEFAULT_NODE_WIDTH),
  height: z.number().finite().positive().catch(DEFAULT_NODE_HEIGHT),
  category: OptionalTextSchema,
  nodeType: OptionalTextSchema,
  parentId: OptionalTextSchema,
});
type PreviewSourceNode = z.infer<typeof PreviewSourceNodeSchema>;

const PreviewSourceEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
});

const PreviewSourceSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

interface ResolvedPosition {
  x: number;
  y: number;
  depth: number;
}

/**
 * 把 {@link selectMarketplacePreviewGraphSource} 的投影结果整理成缩略图图数据。
 *
 * 子节点（Loop / Iteration 容器内）的 position 相对父节点，这里沿父链累加成绝对坐标；
 * 父节点缺失或成环时按顶层处理，保证坏数据也能画出来而不是整张图消失。
 * 没有任何可画节点时返回 null，前端回退到类型渐变封面。
 */
export function buildMarketplacePreviewGraph(
  source: unknown,
): MarketplacePreviewGraph | null {
  const parsedSource = PreviewSourceSchema.safeParse(source);
  if (!parsedSource.success) {
    return null;
  }

  const sourceNodes = new Map<string, PreviewSourceNode>();
  for (const value of parsedSource.data.nodes) {
    const parsed = PreviewSourceNodeSchema.safeParse(value);
    if (parsed.success && !sourceNodes.has(parsed.data.id)) {
      sourceNodes.set(parsed.data.id, parsed.data);
    }
  }
  if (sourceNodes.size === 0) {
    return null;
  }

  const resolved = new Map<string, ResolvedPosition>();
  const resolve = (
    node: PreviewSourceNode,
    visiting: Set<string>,
  ): ResolvedPosition => {
    const cached = resolved.get(node.id);
    if (cached) {
      return cached;
    }
    visiting.add(node.id);
    const parent = node.parentId ? sourceNodes.get(node.parentId) : undefined;
    const origin =
      parent && !visiting.has(parent.id)
        ? resolve(parent, visiting)
        : { x: 0, y: 0, depth: -1 };
    visiting.delete(node.id);
    const absolute = {
      x: origin.x + node.x,
      y: origin.y + node.y,
      depth: origin.depth + 1,
    };
    resolved.set(node.id, absolute);
    return absolute;
  };

  const nodes = [...sourceNodes.values()]
    .map((node, order) => ({ node, absolute: resolve(node, new Set()), order }))
    .sort(
      (left, right) =>
        left.absolute.depth - right.absolute.depth || left.order - right.order,
    )
    .map(({ node, absolute }): MarketplacePreviewGraphNode => ({
      id: node.id,
      x: absolute.x,
      y: absolute.y,
      width: node.width,
      height: node.height,
      category: node.category,
      nodeType: node.nodeType,
    }));

  const edges: MarketplacePreviewGraphEdge[] = [];
  for (const value of parsedSource.data.edges) {
    const parsed = PreviewSourceEdgeSchema.safeParse(value);
    if (
      parsed.success &&
      sourceNodes.has(parsed.data.source) &&
      sourceNodes.has(parsed.data.target)
    ) {
      edges.push(parsed.data);
    }
  }

  return { nodes, edges };
}
