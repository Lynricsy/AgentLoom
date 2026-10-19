import type { ReactFlowEdge, ReactFlowNode } from '../../database/schema';
import type { TypeMismatchDetail } from './execution.exceptions';
import { readEdgeHandle } from './node-value.util';

/**
 * 读取节点某个方向的端口类型信息。
 *
 * 两级查找：normalize 阶段已把内置节点的静态端口写入 data.inputPorts/outputPorts
 * （字段名 id），这是绝大多数边的唯一来源；portMappingMetadata 只有动态端口
 * （MCP 工具、可复用块）才会写，字段名是 name。两处都查不到时 dataType 为 undefined，
 * 调用方保持 no-op —— 动态端口在快照里可能确实没有类型信息，不能误报不兼容。
 */
function resolvePortType(
  node: ReactFlowNode,
  handle: string,
  direction: 'source' | 'target',
): { dataType?: string; acceptsAnyDataType: boolean } {
  const staticPorts = (
    direction === 'source' ? node.data?.outputPorts : node.data?.inputPorts
  ) as
    | Array<{
        id?: string;
        name?: string;
        dataType?: string;
        acceptsAnyDataType?: boolean;
      }>
    | undefined;
  const staticPort = Array.isArray(staticPorts)
    ? staticPorts.find((p) => p?.id === handle || p?.name === handle)
    : undefined;
  if (staticPort?.dataType) {
    return {
      dataType: staticPort.dataType,
      acceptsAnyDataType: staticPort.acceptsAnyDataType === true,
    };
  }

  const metadata = node.data?.portMappingMetadata as
    | {
        outputs?: Array<{ name: string; dataType: string }>;
        inputs?: Array<{ name: string; dataType: string }>;
      }
    | undefined;
  const dynamicPorts =
    direction === 'source' ? metadata?.outputs : metadata?.inputs;
  return {
    dataType: dynamicPorts?.find((p) => p.name === handle)?.dataType,
    acceptsAnyDataType: false,
  };
}

/**
 * 解析一条边两端端口的 dataType，供执行期守卫（node-scheduler）与发布期校验
 * （workflow-publish）共用同一套取值规则。
 *
 * 返回 undefined 表示该边不参与类型校验：缺少端口句柄、端点节点不在图中、任一端
 * 类型无法解析，或任一端声明 acceptsAnyDataType（与 Studio 连线校验一致：原样透传，
 * 不校验也不做类型变换）。
 */
export function resolveEdgePortTypes(
  edge: ReactFlowEdge,
  nodes: readonly ReactFlowNode[],
): TypeMismatchDetail | undefined {
  const sourceHandle = readEdgeHandle(edge, 'source');
  const targetHandle = readEdgeHandle(edge, 'target');
  if (!sourceHandle || !targetHandle) return undefined;

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  if (!sourceNode || !targetNode) return undefined;

  const sourcePort = resolvePortType(sourceNode, sourceHandle, 'source');
  const targetPort = resolvePortType(targetNode, targetHandle, 'target');
  if (!sourcePort.dataType || !targetPort.dataType) return undefined;
  if (sourcePort.acceptsAnyDataType || targetPort.acceptsAnyDataType) {
    return undefined;
  }

  return {
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    sourcePortId: sourceHandle,
    targetPortId: targetHandle,
    sourceType: sourcePort.dataType,
    targetType: targetPort.dataType,
    edgeId: edge.id,
  };
}
