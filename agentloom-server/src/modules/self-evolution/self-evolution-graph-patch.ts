/**
 * 自进化图补丁与 MCP 节点规范化服务。
 * 负责图 CRUD、diff 与 MCP 工具节点补全，不承担目标资源持久化。
 */
import { Injectable } from '@nestjs/common';
import { McpService } from '../mcp/mcp.service';
import { resolveMcpServerConfigId } from '../agent-definition/mcp-tool-descriptor.utils';
import { cloneJsonRecord, cloneJsonValue, readNodeType, readRecord, readString, readStringArray } from './self-evolution-value.util';

export type GraphRecord = Record<string, unknown>;

export interface GraphPatchOperation {
  op: string;
  nodeId?: string;
  edgeId?: string;
  node?: GraphRecord;
  edge?: GraphRecord;
  patch?: GraphRecord;
}

@Injectable()
export class SelfEvolutionGraphPatch {
  constructor(private readonly mcpService: McpService) {}

  applyNodes(nodes: GraphRecord[], operations: GraphPatchOperation[]): GraphRecord[] {
    let next = this.cloneArray(nodes);
    for (const operation of operations) {
      if (operation.op === 'add') {
        const id = this.readString(operation.node?.id);
        if (!operation.node || !id) throw new Error('新增节点时必须提供 node 且包含合法 id');
        if (next.some((item) => this.readString(item.id) === id)) throw new Error(`节点 ${id} 已存在，不能重复新增`);
        next.push(this.cloneRecord(operation.node));
      } else if (operation.op === 'update') {
        if (!operation.nodeId || !operation.patch) throw new Error('更新节点时必须提供 nodeId 与 patch');
        const index = next.findIndex((item) => this.readString(item.id) === operation.nodeId);
        if (index < 0) throw new Error(`待更新节点不存在: ${operation.nodeId}`);
        next[index] = this.merge(next[index], operation.patch);
      } else if (operation.op === 'remove') {
        if (!operation.nodeId) throw new Error('删除节点时必须提供 nodeId');
        next = next.filter((item) => this.readString(item.id) !== operation.nodeId);
      } else {
        throw new Error(`不支持的节点操作: ${operation.op}`);
      }
    }
    return next;
  }

  applyEdges(edges: GraphRecord[], operations: GraphPatchOperation[]): GraphRecord[] {
    let next = this.cloneArray(edges);
    for (const operation of operations) {
      if (operation.op === 'add') {
        const id = this.readString(operation.edge?.id);
        if (!operation.edge || !id) throw new Error('新增连线时必须提供 edge 且包含合法 id');
        if (next.some((item) => this.readString(item.id) === id)) throw new Error(`连线 ${id} 已存在，不能重复新增`);
        next.push(this.cloneRecord(operation.edge));
      } else if (operation.op === 'update') {
        if (!operation.edgeId || !operation.patch) throw new Error('更新连线时必须提供 edgeId 与 patch');
        const index = next.findIndex((item) => this.readString(item.id) === operation.edgeId);
        if (index < 0) throw new Error(`待更新连线不存在: ${operation.edgeId}`);
        next[index] = this.merge(next[index], operation.patch);
      } else if (operation.op === 'remove') {
        if (!operation.edgeId) throw new Error('删除连线时必须提供 edgeId');
        next = next.filter((item) => this.readString(item.id) !== operation.edgeId);
      } else {
        throw new Error(`不支持的连线操作: ${operation.op}`);
      }
    }
    return next;
  }

  private merge(base: GraphRecord, patch: GraphRecord): GraphRecord {
    const result: GraphRecord = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = this.merge(
          result[key] as GraphRecord,
          value as GraphRecord,
        );
      } else {
        result[key] = JSON.parse(JSON.stringify(value)) as unknown;
      }
    }
    return result;
  }

  private cloneArray(value: unknown): GraphRecord[] {
    return Array.isArray(value)
      ? value.map((entry) => this.cloneRecord(entry))
      : [];
  }

  private cloneRecord(value: unknown): GraphRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (JSON.parse(JSON.stringify(value)) as GraphRecord)
      : {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
  buildDiffPreview(params: {
    targetLabel: string;
    nodeOperations: Array<{
      op: string;
      nodeId?: string;
      node?: GraphRecord;
      patch?: GraphRecord;
    }>;
    edgeOperations: Array<{
      op: string;
      edgeId?: string;
      edge?: GraphRecord;
      patch?: GraphRecord;
    }>;
    nextNodes: GraphRecord[];
    nextEdges: GraphRecord[];
    nextViewport?: GraphRecord | null;
    publishTarget: boolean;
  }): Record<string, unknown> {
    const addedNodes = params.nodeOperations
      .filter((operation) => operation.op === 'add')
      .map((operation) => ({
        id: readString(operation.node?.id) ?? 'unknown-node',
        nodeType: readNodeType(operation.node) ?? 'unknown',
      }));
    const updatedNodes = params.nodeOperations
      .filter((operation) => operation.op === 'update')
      .map((operation) => ({
        id: operation.nodeId ?? 'unknown-node',
      }));
    const removedNodes = params.nodeOperations
      .filter((operation) => operation.op === 'remove')
      .map((operation) => ({
        id: operation.nodeId ?? 'unknown-node',
      }));

    const addedEdges = params.edgeOperations
      .filter((operation) => operation.op === 'add')
      .map((operation) => ({
        id: readString(operation.edge?.id) ?? 'unknown-edge',
      }));
    const updatedEdges = params.edgeOperations
      .filter((operation) => operation.op === 'update')
      .map((operation) => ({
        id: operation.edgeId ?? 'unknown-edge',
      }));
    const removedEdges = params.edgeOperations
      .filter((operation) => operation.op === 'remove')
      .map((operation) => ({
        id: operation.edgeId ?? 'unknown-edge',
      }));

    return {
      summary: [
        `${params.targetLabel}：节点 +${addedNodes.length}/~${updatedNodes.length}/-${removedNodes.length}`,
        `连线 +${addedEdges.length}/~${updatedEdges.length}/-${removedEdges.length}`,
        params.publishTarget ? '完成后立即发布' : '仅更新目标编排',
      ].join('，'),
      addedNodes,
      updatedNodes,
      removedNodes,
      addedEdges,
      updatedEdges,
      removedEdges,
      nextNodeCount: params.nextNodes.length,
      nextEdgeCount: params.nextEdges.length,
      ...(params.nextViewport ? { viewport: params.nextViewport } : {}),
    };
  }

  async normalizeMcpToolNodes(
    tenantId: string,
    nodes: GraphRecord[],
  ): Promise<GraphRecord[]> {
    const hasMcpToolNode = nodes.some((node) => {
      const data = readRecord(node.data);
      const nodeType = readString(data?.nodeType);
      return nodeType === 'mcp-tool' || nodeType === 'mcp';
    });
    if (!hasMcpToolNode) {
      return nodes;
    }

    const activeToolsByConfigId = new Map<string, GraphRecord[]>();
    const tools = await this.mcpService.listTools(tenantId, 'mcp');
    for (const tool of tools) {
      if (!tool.isActive || typeof tool.mcpServerConfigId !== 'string') {
        continue;
      }

      const normalizedTool = {
        id: tool.id,
        name: tool.name,
        title: tool.title ?? null,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema ?? null,
        outputSchema: tool.outputSchema ?? null,
        portMappingMetadata: tool.portMappingMetadata ?? null,
        source: tool.source,
        mcpServerConfigId: tool.mcpServerConfigId,
        isActive: tool.isActive,
        annotations: tool.annotations ?? null,
      } satisfies GraphRecord;

      const bucket = activeToolsByConfigId.get(tool.mcpServerConfigId) ?? [];
      bucket.push(normalizedTool);
      activeToolsByConfigId.set(tool.mcpServerConfigId, bucket);
    }

    return nodes.map((node) =>
      this.normalizeMcpToolNode(node, activeToolsByConfigId),
    );
  }

  normalizeMcpToolNode(
    node: GraphRecord,
    activeToolsByConfigId: Map<string, GraphRecord[]>,
  ): GraphRecord {
    const data = readRecord(node.data);
    if (!data) {
      return node;
    }

    const nodeType = readString(data.nodeType);
    if (nodeType !== 'mcp-tool' && nodeType !== 'mcp') {
      return node;
    }

    const config = readRecord(data.config) ?? {};
    const merged = { ...config, ...data };
    const mcpServerConfigId = resolveMcpServerConfigId(merged);
    if (!mcpServerConfigId) {
      return node;
    }

    const activeTools = activeToolsByConfigId.get(mcpServerConfigId) ?? [];
    const availableToolIds = new Set(
      activeTools
        .map((tool) => readString(tool.id))
        .filter((value): value is string => Boolean(value)),
    );
    const configuredToolIds = [
      ...readStringArray(config.enabledToolIds),
      ...readStringArray(config.enabled_tool_ids),
      ...readStringArray(data.enabledToolIds),
      ...readStringArray(data.enabled_tool_ids),
    ].filter((toolId, index, array) => array.indexOf(toolId) === index);
    const normalizedEnabledToolIds = configuredToolIds.filter((toolId) =>
      availableToolIds.has(toolId),
    );
    const enabledToolIds =
      normalizedEnabledToolIds.length > 0
        ? normalizedEnabledToolIds
        : [...availableToolIds];
    const mcpServerName =
      readString(config.mcpServerName) ??
      readString(data.mcpServerName) ??
      readString(data.label);
    const {
      mcpServerId: _configServerId,
      mcp_server_id: _configServerIdSnake,
      mcpServerConfigId: _existingConfigId,
      mcp_server_config_id: _existingConfigIdSnake,
      enabled_tool_ids: _configEnabledToolIdsSnake,
      ...configRest
    } = config;
    const {
      mcpServerId: _dataServerId,
      mcp_server_id: _dataServerIdSnake,
      mcpServerConfigId: _existingDataConfigId,
      mcp_server_config_id: _existingDataConfigIdSnake,
      enabledToolIds: _existingDataEnabledToolIds,
      enabled_tool_ids: _existingDataEnabledToolIdsSnake,
      mcpServerName: _existingDataServerName,
      ...dataRest
    } = data;

    return {
      ...node,
      type: 'tool',
      data: {
        ...dataRest,
        nodeType: 'mcp-tool',
        category: 'tool',
        ...(mcpServerConfigId ? { mcpServerConfigId } : {}),
        ...(mcpServerName ? { mcpServerName } : {}),
        config: {
          ...configRest,
          ...(mcpServerConfigId ? { mcpServerConfigId } : {}),
          ...(mcpServerName ? { mcpServerName } : {}),
          enabledToolIds,
          tools: activeTools.map((tool) => cloneJsonRecord(tool)),
        },
        inputPorts: Array.isArray(data.inputPorts)
          ? cloneJsonValue(data.inputPorts)
          : [],
        outputPorts:
          Array.isArray(data.outputPorts) && data.outputPorts.length > 0
            ? cloneJsonValue(data.outputPorts)
            : [
                {
                  id: 'tool-out',
                  label: '工具',
                  direction: 'output',
                  dataType: 'tool',
                  required: false,
                  multiple: true,
                  maxConnections: null,
                  schema: { kind: 'tool', title: '工具' },
                },
              ],
      },
    };
  }

}
