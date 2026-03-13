import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class McpConnectionFailedException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/mcp/connection-failed',
      title: 'MCP 连接失败',
      status: HttpStatus.BAD_GATEWAY,
      detail,
    });
  }
}

export class McpConnectionTimeoutException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/mcp/connection-timeout',
      title: 'MCP 连接超时',
      status: HttpStatus.GATEWAY_TIMEOUT,
      detail,
    });
  }
}

export class McpDiscoveryFailedException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/mcp/discovery-failed',
      title: 'MCP 工具发现失败',
      status: HttpStatus.BAD_GATEWAY,
      detail,
    });
  }
}

export class McpImportConflictException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/mcp/import-conflict',
      title: 'MCP 工具导入冲突',
      status: HttpStatus.CONFLICT,
      detail,
    });
  }
}

export class McpToolNotFoundException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/mcp/tool-not-found',
      title: 'MCP 工具未找到',
      status: HttpStatus.NOT_FOUND,
      detail,
    });
  }
}

export class McpToolDeactivationNotAllowedException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/mcp/tool-deactivation-not-allowed',
      title: 'MCP 工具停用不被允许',
      status: HttpStatus.CONFLICT,
      detail,
    });
  }
}

export class McpServerConfigNotFoundException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/mcp/server-config-not-found',
      title: 'MCP 服务器配置未找到',
      status: HttpStatus.NOT_FOUND,
      detail,
    });
  }
}
