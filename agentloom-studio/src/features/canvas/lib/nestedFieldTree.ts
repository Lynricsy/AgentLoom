import type {
  NestedFieldNode,
  PortDefinition,
  TypeSchema,
} from '../types'

/** 嵌套字段树最大展开深度 */
export const MAX_NESTED_DEPTH = 5

/**
 * 从 TypeSchema 递归构建嵌套字段树节点。
 * Object 类型展开为属性子节点，Array 类型生成虚拟 `[*]` 子节点。
 * 叶子节点为标量类型或达到深度上限时的截断节点。
 */
function buildSchemaTree(
  path: string,
  leafKey: string,
  schema: TypeSchema,
  required: boolean,
  depth: number,
  mappedPaths: ReadonlySet<string>,
): NestedFieldNode {
  // 超出深度限制 → 强制叶子
  if (depth >= MAX_NESTED_DEPTH) {
    return {
      path,
      leafKey,
      schema,
      required,
      depth,
      isExpanded: false,
      isLeaf: true,
      isMapped: mappedPaths.has(path),
    }
  }

  // Object 类型 → 展开属性
  if (schema.kind === 'json' && schema.shape === 'object') {
    const requiredProps = schema.required ?? []
    const children = Object.entries(schema.properties).map(
      ([propName, propSchema]) => {
        const childPath = path ? `${path}.${propName}` : propName
        return buildSchemaTree(
          childPath,
          propName,
          propSchema,
          requiredProps.includes(propName),
          depth + 1,
          mappedPaths,
        )
      },
    )

    return {
      path,
      leafKey,
      schema,
      required,
      depth,
      isExpanded: false,
      isLeaf: false,
      isMapped: mappedPaths.has(path),
      children,
    }
  }

  // Array 类型 → 虚拟 items[*] 子节点
  if (schema.kind === 'json' && schema.shape === 'array') {
    const virtualPath = path ? `${path}[*]` : '[*]'
    const itemChild = buildSchemaTree(
      virtualPath,
      'items[*]',
      schema.items,
      false,
      depth + 1,
      mappedPaths,
    )

    return {
      path,
      leafKey,
      schema,
      required,
      depth,
      isExpanded: false,
      isLeaf: false,
      isMapped: mappedPaths.has(path),
      children: [itemChild],
    }
  }

  // 标量类型 → 叶子节点
  return {
    path,
    leafKey,
    schema,
    required,
    depth,
    isExpanded: false,
    isLeaf: true,
    isMapped: mappedPaths.has(path),
  }
}

/**
 * 从端口列表构建嵌套字段树。
 * 每个端口成为一个顶层节点，JSON Object 端口展开为属性子树。
 */
export function buildNestedFieldTree(
  ports: PortDefinition[],
  mappedPaths: ReadonlySet<string> = new Set(),
): NestedFieldNode[] {
  return ports.map((port) =>
    buildSchemaTree(
      port.id,
      port.label,
      port.schema,
      port.required,
      0,
      mappedPaths,
    ),
  )
}

/**
 * 收集嵌套树中所有叶子节点的路径（用于映射操作）。
 */
export function collectLeafPaths(nodes: NestedFieldNode[]): string[] {
  const paths: string[] = []

  function walk(node: NestedFieldNode): void {
    if (node.isLeaf) {
      paths.push(node.path)
      return
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  for (const node of nodes) {
    walk(node)
  }
  return paths
}

/**
 * 按路径索引嵌套树的全部叶子节点（用于按 path 反查 schema / required）。
 */
export function buildLeafNodeMap(
  nodes: NestedFieldNode[],
): Map<string, NestedFieldNode> {
  const map = new Map<string, NestedFieldNode>()

  function walk(node: NestedFieldNode): void {
    if (node.isLeaf) {
      map.set(node.path, node)
      return
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  for (const node of nodes) {
    walk(node)
  }
  return map
}
