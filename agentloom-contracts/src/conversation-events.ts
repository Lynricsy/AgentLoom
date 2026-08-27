import { z } from 'zod';

/**
 * Agent 对话实时事件的 wire 契约。
 *
 * 目前只收录 `conversation.state.snapshot`：它是断线重连时的兜底通道。
 * 对话侧没有带 wire eventId 的持久事件表（`agent_messages` 只存轮末聚合正文与
 * segments），一旦 EventBridge 的内存缓冲出现缺口（终态 30s 清理、进程重启），
 * 逐事件补发就无从谈起。此前 gateway 在这种情况下**静默结束**，客户端永远补不回
 * 断线期间的内容；现在改为下发一份持久 snapshot，语义与 execution 侧的
 * `execution.state.snapshot` 对齐。
 *
 * 注意：禁止把聚合正文伪装成一条没有 eventId 的 `message_chunk` 下发——那会让
 * 客户端把它当成增量追加，导致正文重复。
 */
export const CONVERSATION_STATE_SNAPSHOT_EVENT =
  'conversation.state.snapshot' as const;

export const ConversationSnapshotMessageSchema = z.object({
  messageId: z.string(),
  role: z.string(),
  contentType: z.string(),
  content: z.string(),
  /** 轮内工具调用，来源为 `agent_messages.tool_calls`。缺了它客户端的工具卡会被 snapshot 抹掉。 */
  toolCalls: z.array(z.unknown()).nullable(),
  /**
   * 持久 metadata（segments / attachments / thinking 等）。
   * 客户端按历史消息的同一套规则归一化——snapshot 是按 messageId 整条覆盖的，
   * 少带一个字段就等于把界面上对应的部分抹掉。
   */
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export type ConversationSnapshotMessage = z.infer<
  typeof ConversationSnapshotMessageSchema
>;

export const ConversationStateSnapshotSchema = z.object({
  event: z.literal(CONVERSATION_STATE_SNAPSHOT_EVENT),
  conversationId: z.string(),
  /** 服务端当前的事件序号；这是新 epoch 的起点，客户端应据此**直接重置** lastEventId。 */
  lastEventId: z.number().int().nonnegative(),
  /** 快照原因：缓存缺口无法逐事件补发。 */
  reason: z.literal('replay-buffer-gap'),
  messages: z.array(ConversationSnapshotMessageSchema),
  timestamp: z.string(),
});

export type ConversationStateSnapshot = z.infer<
  typeof ConversationStateSnapshotSchema
>;
