import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * 工具调用审批会同时被工作流执行与对话运行时使用，因此异常必须位于共享边界，
 * 避免对话模块为了复用稳定的 Problem Details 契约而反向依赖 execution 模块。
 */
export class ToolCallNotFoundException extends DomainException {
  constructor(toolCallId: string) {
    super({
      type: 'https://agentloom.dev/errors/tool-call-not-found',
      title: '工具调用不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `工具调用 ${toolCallId} 不存在`,
    });
  }
}

export class ToolPermissionResolutionNotAllowedException extends DomainException {
  constructor(toolCallId: string, currentStatus: string) {
    super({
      type: 'https://agentloom.dev/errors/tool-permission-resolution-not-allowed',
      title: '工具调用不在等待审批状态',
      status: HttpStatus.CONFLICT,
      detail: `工具调用 ${toolCallId} 当前状态为 ${currentStatus}，无法进行权限审批`,
    });
  }
}
