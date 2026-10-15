import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  TEAM_MEMBER_CONVERSATION_CANCEL_EVENT,
  TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
  type TeamMemberConversationEvent,
} from '../team/team.events';
import { AgentExecutionService } from './agent-execution.service';

/**
 * 团队运行时 → 对话执行的事件桥：TeamModule 不能导入本模块（本模块导入 TeamModule 注册成员工具），
 * 成员对话的派发与取消经事件在此调用 AgentExecutionService。
 */
@Injectable()
export class TeamConversationBridgeListener {
  private readonly logger = new Logger(TeamConversationBridgeListener.name);

  constructor(private readonly executionService: AgentExecutionService) {}

  @OnEvent(TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT)
  async handleDispatch(payload: TeamMemberConversationEvent): Promise<void> {
    try {
      await this.executionService.dispatchExecution(
        payload.conversationId,
        payload.tenantId,
      );
    } catch (error) {
      // 派发失败（维护模式、入队失败）由团队清扫按未消费消息重新派发
      this.logger.warn(
        `派发团队成员对话 ${payload.conversationId} 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @OnEvent(TEAM_MEMBER_CONVERSATION_CANCEL_EVENT)
  async handleCancel(payload: TeamMemberConversationEvent): Promise<void> {
    try {
      await this.executionService.cancelExecution(payload.conversationId, {
        tenantId: payload.tenantId,
      });
    } catch (error) {
      // 对话已结束时 cancel 报不存在：仍中止可能残留的执行循环
      this.logger.debug(
        `结束团队成员对话 ${payload.conversationId}：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.executionService.abortExecution(payload.conversationId);
    }
  }
}
