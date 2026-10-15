import type { AgentApiRun, AgentApiRunStatus } from '@agentloom/contracts';

import { API_GLOBAL_PREFIX } from '../../openapi/swagger-document';
import {
  A2A_PROTOCOL_VERSION,
  type A2aAgentCard,
  type A2aArtifact,
  type A2aOutboundMessage,
  type A2aRole,
  type A2aTask,
  type A2aTaskState,
} from './a2a.types';

/** 流式输出中增量文本所在的 artifact id；终态时另发一个以回复消息 id 为 id 的完整 artifact */
export const A2A_STREAMING_ARTIFACT_ID = 'response';

const TEXT_MEDIA_TYPE = 'text/plain';

const TASK_STATE_BY_RUN_STATUS: Record<AgentApiRunStatus, A2aTaskState> = {
  queued: 'TASK_STATE_SUBMITTED',
  running: 'TASK_STATE_WORKING',
  completed: 'TASK_STATE_COMPLETED',
  failed: 'TASK_STATE_FAILED',
  cancelled: 'TASK_STATE_CANCELED',
};

const TERMINAL_TASK_STATES: readonly A2aTaskState[] = [
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
];

export function toTaskState(status: AgentApiRunStatus): A2aTaskState {
  return TASK_STATE_BY_RUN_STATUS[status];
}

export function isTerminalTaskState(state: A2aTaskState): boolean {
  return TERMINAL_TASK_STATES.includes(state);
}

/** 状态时间戳：终态取结束时间，其次开始时间，最后创建时间（ISO 8601，毫秒精度） */
export function toTaskTimestamp(run: AgentApiRun): string {
  return new Date(
    run.completedAt ?? run.startedAt ?? run.createdAt,
  ).toISOString();
}

/** run 的输入或输出转成 A2A 消息；assistant 侧在 run 尚无输出时返回 null */
export function toMessage(
  run: AgentApiRun,
  role: A2aRole,
): A2aOutboundMessage | null {
  const source = role === 'ROLE_USER' ? run.input : run.output;
  if (!source) {
    return null;
  }
  return {
    messageId: source.messageId,
    contextId: run.conversationId,
    taskId: run.id,
    role,
    parts: [{ text: source.content, mediaType: TEXT_MEDIA_TYPE }],
  };
}

export function toResponseArtifact(run: AgentApiRun): A2aArtifact | null {
  if (!run.output) {
    return null;
  }
  return {
    artifactId: run.output.messageId,
    name: 'response',
    parts: [{ text: run.output.content, mediaType: TEXT_MEDIA_TYPE }],
  };
}

/**
 * agent_api_runs 行 → A2A Task：`id` = run id，`contextId` = 对话 id。
 * 仅已完成的任务携带 artifact；`historyLength` 为 0 时不返回 history，缺省时返回全部（至多两条）。
 */
export function toTask(
  run: AgentApiRun,
  opts: { historyLength?: number } = {},
): A2aTask {
  const state = toTaskState(run.status);
  const artifact =
    state === 'TASK_STATE_COMPLETED' ? toResponseArtifact(run) : null;

  const task: A2aTask = {
    id: run.id,
    contextId: run.conversationId,
    status: { state, timestamp: toTaskTimestamp(run) },
    artifacts: artifact ? [artifact] : [],
    metadata: {
      agentVersionId: run.agentVersionId,
      stopReason: run.stopReason,
      error: run.error,
    },
  };

  if (opts.historyLength !== 0) {
    const history = [
      toMessage(run, 'ROLE_USER'),
      toMessage(run, 'ROLE_AGENT'),
    ].filter((message): message is A2aOutboundMessage => message !== null);
    task.history =
      opts.historyLength === undefined
        ? history
        : history.slice(-opts.historyLength);
  }

  return task;
}

export interface A2aAgentCardSource {
  agentDefinitionId: string;
  name: string;
  description: string | null;
  /** 已发布版本的版本号 */
  versionNumber: number;
  organizationName: string;
}

export function buildA2aRpcUrl(
  baseUrl: string,
  agentDefinitionId: string,
): string {
  return `${baseUrl.replace(/\/+$/, '')}/${API_GLOBAL_PREFIX}/a2a/agents/${agentDefinitionId}/rpc`;
}

/** 按 Agent 定义暴露的公开 Agent Card；鉴权方式为 AgentLoom Agent API Key */
export function toAgentCard(
  agent: A2aAgentCardSource,
  baseUrl: string,
): A2aAgentCard {
  const description = agent.description?.trim() || agent.name;
  return {
    name: agent.name,
    description,
    supportedInterfaces: [
      {
        url: buildA2aRpcUrl(baseUrl, agent.agentDefinitionId),
        protocolBinding: 'JSONRPC',
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    provider: { organization: agent.organizationName },
    version: String(agent.versionNumber),
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    securitySchemes: {
      agentApiKey: {
        httpAuthSecurityScheme: {
          scheme: 'Bearer',
          bearerFormat: 'alak_<64 hex>',
          description: 'AgentLoom Agent API Key',
        },
      },
    },
    securityRequirements: [{ schemes: { agentApiKey: { list: [] } } }],
    defaultInputModes: [TEXT_MEDIA_TYPE],
    defaultOutputModes: [TEXT_MEDIA_TYPE],
    skills: [
      {
        id: agent.agentDefinitionId,
        name: agent.name,
        description,
        tags: [],
        inputModes: [TEXT_MEDIA_TYPE],
        outputModes: [TEXT_MEDIA_TYPE],
      },
    ],
  };
}
