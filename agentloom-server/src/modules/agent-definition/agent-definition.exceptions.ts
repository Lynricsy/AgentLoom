import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';
import type {
  InvalidAgentCanvasMcpToolNode,
  UnsupportedAgentCanvasNodeType,
} from './agent-input-node-migration.util';

export class AgentNotFoundException extends DomainException {
  constructor(agentId: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-not-found',
      title: 'Agent 不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Agent ${agentId} 不存在`,
    });
  }
}

export class AgentArchivedException extends DomainException {
  constructor(agentId: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-archived',
      title: 'Agent 已归档',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} 已归档，无法执行此操作`,
    });
  }
}

export class AgentVersionConflictException extends DomainException {
  constructor(agentId: string, currentVersion: number) {
    super({
      type: 'https://agentloom.dev/errors/agent-version-conflict',
      title: '版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} 已被其他用户修改，请刷新后重试`,
      extensions: {
        currentVersion,
      },
      errors: [
        {
          field: 'version',
          message: `当前版本为 ${currentVersion}`,
        },
      ],
    });
  }
}

export class AgentVersionNotFoundException extends DomainException {
  constructor(versionId: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-version-not-found',
      title: 'Agent 版本不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Agent 版本 ${versionId} 不存在`,
    });
  }
}

export class AgentPublishValidationException extends DomainException {
  constructor(reasons: string | string[]) {
    const validationReasons = Array.isArray(reasons) ? reasons : [reasons];

    super({
      type: 'https://agentloom.dev/errors/agent-publish-validation',
      title: 'Agent 发布验证失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: validationReasons[0] ?? 'Agent 发布校验失败',
      errors: validationReasons.map((message) => ({
        field: 'agent',
        message,
      })),
    });
  }
}

export class AgentSandboxNotConnectedException extends DomainException {
  constructor(agentId: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-sandbox-not-connected',
      title: '当前 Agent 未连接任何沙箱，无法启动对话',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} 未将任何 sandbox 节点连接到 agent-main 的 sandbox-in 端口，请先连线后再运行`,
    });
  }
}

export class AgentCanvasUnknownNodeTypeException extends DomainException {
  constructor(nodes: UnsupportedAgentCanvasNodeType[]) {
    const firstNode = nodes[0];

    super({
      type: 'https://agentloom.dev/errors/agent-canvas-unknown-node-type',
      title: 'Agent 画布包含未知节点类型',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: firstNode
        ? `节点 ${firstNode.nodeId} 使用了当前版本不支持的 nodeType：${firstNode.nodeType}`
        : 'Agent 画布包含当前版本不支持的节点类型',
      errors: nodes.map((node) => ({
        field: 'canvasNodes',
        message: `节点 ${node.nodeId} 的 nodeType「${node.nodeType}」当前不受支持，请升级系统或移除该节点后重试`,
      })),
      extensions: {
        nodes,
      },
    });
  }
}

export class AgentCanvasInvalidMcpToolBindingException extends DomainException {
  constructor(nodes: InvalidAgentCanvasMcpToolNode[]) {
    const firstNode = nodes[0];
    const firstIssue = firstNode?.issues[0];

    super({
      type: 'https://agentloom.dev/errors/agent-canvas-invalid-mcp-tool-binding',
      title: 'Agent MCP 节点配置不完整',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail:
        firstNode && firstIssue
          ? `节点 ${firstNode.nodeId} 的 MCP 配置不完整：${firstIssue}`
          : 'Agent 画布中的 MCP 节点配置不完整',
      errors: nodes.map((node) => ({
        field: 'canvasNodes',
        message: `节点 ${node.nodeId} 的 mcp-tool 配置不完整（${node.issues.join(
          '；',
        )}）。请把 node.data.config.mcpServerConfigId、enabledToolIds 和 tools[] 一起写完整，并至少选择一个具体工具。`,
      })),
      extensions: {
        nodes,
        expectedShape: {
          type: 'tool',
          data: {
            nodeType: 'mcp-tool',
            config: {
              mcpServerConfigId: '<server-id>',
              enabledToolIds: ['<tool-id>'],
              tools: [
                {
                  id: '<tool-id>',
                  name: '<tool-name>',
                  mcpServerConfigId: '<server-id>',
                },
              ],
            },
            outputPorts: [{ id: 'tool-out' }],
          },
        },
        fixHint:
          '请在 node.data.config 中显式写入 mcpServerConfigId、enabledToolIds 与 tools[]；enabledToolIds 里的每个 tool id 都必须在 tools[] 中有对应的 id/name/mcpServerConfigId 元数据。',
      },
    });
  }
}
