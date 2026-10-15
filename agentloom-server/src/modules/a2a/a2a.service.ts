import { Inject, Injectable } from '@nestjs/common';
import type { AgentApiRun } from '@agentloom/contracts';
import { and, eq, isNotNull } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentDefinitions,
  agentVersions,
} from '../../database/schema/agent-definitions.schema';
import { organizations } from '../../database/schema/organizations.schema';
import { AgentApiConversationNotFoundException } from '../agent-api/agent-api.exceptions';
import { AgentApiService } from '../agent-api/agent-api.service';
import type { AgentApiKeyContext } from '../agent-api/agent-api.types';
import { CreateAgentApiRunSchema } from '../agent-api/dto/agent-api-request.dto';
import {
  isTerminalTaskState,
  toAgentCard,
  toTask,
  toTaskState,
} from './a2a-mapper';
import { A2aAgentNotFoundException, A2aRpcError } from './a2a.exceptions';
import {
  A2A_BLOCKING_WAIT_SECONDS,
  A2A_ERRORS,
  JSON_RPC_ERRORS,
  type A2aAgentCard,
  type A2aTask,
  type SendMessageParams,
} from './a2a.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A2A 1.0 入站薄适配：全部复用 Agent 对外 API（对话 = contextId，run = taskId），
 * 不引入新的执行路径或持久化。
 */
@Injectable()
export class A2aService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly agentApiService: AgentApiService,
  ) {}

  /**
   * 公开 Agent Card：无鉴权、没有租户上下文，用基础连接按 id 精确读取，
   * 只暴露已发布 Agent 的名称、描述、版本号与所属组织名。
   */
  async getAgentCard(
    agentDefinitionId: string,
    baseUrl: string,
  ): Promise<A2aAgentCard> {
    if (!UUID_PATTERN.test(agentDefinitionId)) {
      throw new A2aAgentNotFoundException(agentDefinitionId);
    }

    const [agent] = await this.db
      .select({
        name: agentDefinitions.name,
        description: agentDefinitions.description,
        versionNumber: agentVersions.versionNumber,
        organizationName: organizations.name,
      })
      .from(agentDefinitions)
      .innerJoin(
        agentVersions,
        eq(agentVersions.id, agentDefinitions.publishedVersionId),
      )
      .innerJoin(
        organizations,
        eq(organizations.tenantId, agentDefinitions.tenantId),
      )
      .where(
        and(
          eq(agentDefinitions.id, agentDefinitionId),
          eq(agentDefinitions.status, 'published'),
          isNotNull(agentVersions.publishedAt),
        ),
      )
      .limit(1);

    if (!agent) {
      throw new A2aAgentNotFoundException(agentDefinitionId);
    }

    return toAgentCard({ agentDefinitionId, ...agent }, baseUrl);
  }

  /**
   * 把 A2A 消息转成 run：`messageId` 作为幂等键，客户端重发同一条消息得到同一个任务。
   * 无 contextId 时对话与 run 在同一事务里创建，重放返回首次创建的任务（同一 contextId），
   * 不会再新建对话；同一 messageId 换内容重发报 -32602。
   */
  async startMessageRun(
    key: AgentApiKeyContext,
    params: SendMessageParams,
  ): Promise<AgentApiRun> {
    const { message } = params;
    if (message.taskId !== undefined) {
      throw new A2aRpcError(
        A2A_ERRORS.UnsupportedOperation,
        'task continuation is not supported; send to the contextId',
      );
    }
    if (message.role !== 'ROLE_USER') {
      throw new A2aRpcError(
        JSON_RPC_ERRORS.InvalidParams,
        'message.role must be ROLE_USER',
      );
    }

    const texts: string[] = [];
    for (const part of message.parts) {
      if (part.text === undefined) {
        throw new A2aRpcError(
          A2A_ERRORS.ContentTypeNotSupported,
          'only text parts are supported',
        );
      }
      texts.push(part.text);
    }
    const body = CreateAgentApiRunSchema.safeParse({
      input: { content: texts.join('\n') },
    });
    if (!body.success) {
      throw new A2aRpcError(
        JSON_RPC_ERRORS.InvalidParams,
        'message text must be 1-100000 characters',
      );
    }

    const idempotencyKey = `a2a:${message.messageId}`;
    if (message.contextId === undefined) {
      const { run } = await this.agentApiService.createRunInNewConversation(
        key,
        { conversation: {}, body: body.data, idempotencyKey },
      );
      return run;
    }

    let conversationId: string;
    try {
      conversationId = (
        await this.agentApiService.getConversation(key, message.contextId)
      ).id;
    } catch (error) {
      if (error instanceof AgentApiConversationNotFoundException) {
        throw new A2aRpcError(
          JSON_RPC_ERRORS.InvalidParams,
          `context ${message.contextId} not found`,
        );
      }
      throw error;
    }

    const { run } = await this.agentApiService.createRun(key, conversationId, {
      body: body.data,
      idempotencyKey,
    });
    return run;
  }

  /**
   * `SendMessage`（非流式）：默认阻塞等待任务结束，最多 {@link A2A_BLOCKING_WAIT_SECONDS} 秒，
   * 到期仍未终态时返回当前状态；`returnImmediately` 时立即返回。
   */
  async sendMessage(
    key: AgentApiKeyContext,
    params: SendMessageParams,
    signal?: AbortSignal,
  ): Promise<{ task: A2aTask }> {
    const run = await this.startMessageRun(key, params);
    const historyLength = params.configuration?.historyLength;
    if (params.configuration?.returnImmediately) {
      return { task: toTask(run, { historyLength }) };
    }

    const current = await this.agentApiService.waitForRun(
      key,
      run,
      A2A_BLOCKING_WAIT_SECONDS,
      signal,
    );
    return { task: toTask(current, { historyLength }) };
  }

  async getTask(
    key: AgentApiKeyContext,
    taskId: string,
    historyLength?: number,
  ): Promise<A2aTask> {
    const run = await this.agentApiService.findRunById(key, taskId);
    return toTask(run, { historyLength });
  }

  async cancelTask(key: AgentApiKeyContext, taskId: string): Promise<A2aTask> {
    const run = await this.agentApiService.findRunById(key, taskId);
    return toTask(
      await this.agentApiService.cancelRun(key, run.conversationId, run.id),
    );
  }

  /** `SubscribeToTask` 的前置检查：已终态的任务不可订阅 */
  async loadSubscribableRun(
    key: AgentApiKeyContext,
    taskId: string,
  ): Promise<AgentApiRun> {
    const run = await this.agentApiService.findRunById(key, taskId);
    if (isTerminalTaskState(toTaskState(run.status))) {
      throw new A2aRpcError(
        A2A_ERRORS.UnsupportedOperation,
        'task is in a terminal state and cannot be subscribed',
      );
    }
    return run;
  }
}
