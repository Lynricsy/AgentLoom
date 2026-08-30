import type { StopReason } from '../agent/types/agent-event.types';
import type { PreparationPhase } from '../execution/types/execution-event.types';

export type ConversationExecutionMetadata = {
  sessionId?: string;
  memorySessionIds?: string[];
  loadedPublishedVersionId?: string;
  lastProcessedMessageId?: string;
  lastAssistantMessageId?: string;
  lastStopReason?: StopReason;
  runningState?: 'idle' | 'running' | 'failed' | 'cancelled';
  errorMessage?: string | null;
  errorCode?: string | null;
  rawErrorMessage?: string | null;
  failedPhase?: PreparationPhase | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function readExecutionMetadata(
  metadata: Record<string, unknown>,
): ConversationExecutionMetadata {
  const execution = metadata['execution'];
  if (!execution || typeof execution !== 'object' || Array.isArray(execution)) {
    return {};
  }

  const executionRecord = execution as Record<string, unknown>;

  return {
    ...(typeof executionRecord.sessionId === 'string'
      ? { sessionId: executionRecord.sessionId }
      : {}),
    ...(Array.isArray(executionRecord.memorySessionIds)
      ? {
          memorySessionIds: executionRecord.memorySessionIds.filter(
            (value): value is string => typeof value === 'string',
          ),
        }
      : {}),
    ...(typeof executionRecord.loadedPublishedVersionId === 'string'
      ? {
          loadedPublishedVersionId: executionRecord.loadedPublishedVersionId,
        }
      : {}),
    ...(typeof executionRecord.lastProcessedMessageId === 'string'
      ? { lastProcessedMessageId: executionRecord.lastProcessedMessageId }
      : {}),
    ...(typeof executionRecord.lastAssistantMessageId === 'string'
      ? { lastAssistantMessageId: executionRecord.lastAssistantMessageId }
      : {}),
    ...(typeof executionRecord.lastStopReason === 'string'
      ? { lastStopReason: executionRecord.lastStopReason as StopReason }
      : {}),
    ...(typeof executionRecord.runningState === 'string'
      ? {
          runningState: executionRecord.runningState as
            'idle' | 'running' | 'failed' | 'cancelled',
        }
      : {}),
    ...(typeof executionRecord.errorMessage === 'string'
      ? { errorMessage: executionRecord.errorMessage }
      : {}),
    ...(typeof executionRecord.errorCode === 'string'
      ? { errorCode: executionRecord.errorCode }
      : {}),
    ...(typeof executionRecord.rawErrorMessage === 'string'
      ? { rawErrorMessage: executionRecord.rawErrorMessage }
      : {}),
    ...(typeof executionRecord.failedPhase === 'string'
      ? {
          failedPhase:
            executionRecord.failedPhase as ConversationExecutionMetadata['failedPhase'],
        }
      : {}),
  };
}

export function mergeExecutionMetadata(
  baseMetadata: Record<string, unknown>,
  patch: Partial<ConversationExecutionMetadata>,
): ConversationExecutionMetadata {
  const current = readExecutionMetadata(baseMetadata);
  const merged = {
    ...current,
    ...patch,
    ...(patch.lastProcessedMessageId === undefined
      ? {}
      : { lastProcessedMessageId: patch.lastProcessedMessageId }),
    ...(patch.lastAssistantMessageId === undefined
      ? {}
      : { lastAssistantMessageId: patch.lastAssistantMessageId }),
    ...(patch.memorySessionIds === undefined
      ? {}
      : { memorySessionIds: patch.memorySessionIds }),
    ...(patch.loadedPublishedVersionId === undefined
      ? {}
      : { loadedPublishedVersionId: patch.loadedPublishedVersionId }),
    ...(patch.errorMessage === undefined
      ? {}
      : { errorMessage: patch.errorMessage }),
    ...(patch.errorCode === undefined ? {} : { errorCode: patch.errorCode }),
    ...(patch.rawErrorMessage === undefined
      ? {}
      : { rawErrorMessage: patch.rawErrorMessage }),
    ...(patch.failedPhase === undefined
      ? {}
      : { failedPhase: patch.failedPhase }),
  };

  return {
    ...(typeof merged.sessionId === 'string'
      ? { sessionId: merged.sessionId }
      : {}),
    ...(Array.isArray(merged.memorySessionIds)
      ? {
          memorySessionIds: merged.memorySessionIds.filter(
            (value): value is string => typeof value === 'string',
          ),
        }
      : {}),
    ...(typeof merged.loadedPublishedVersionId === 'string'
      ? { loadedPublishedVersionId: merged.loadedPublishedVersionId }
      : {}),
    ...(typeof merged.lastProcessedMessageId === 'string'
      ? { lastProcessedMessageId: merged.lastProcessedMessageId }
      : {}),
    ...(typeof merged.lastAssistantMessageId === 'string'
      ? { lastAssistantMessageId: merged.lastAssistantMessageId }
      : {}),
    ...(typeof merged.lastStopReason === 'string'
      ? { lastStopReason: merged.lastStopReason as StopReason }
      : {}),
    ...(typeof merged.runningState === 'string'
      ? { runningState: merged.runningState }
      : {}),
    ...(typeof merged.errorMessage === 'string'
      ? { errorMessage: merged.errorMessage }
      : {}),
    ...(typeof merged.errorCode === 'string'
      ? { errorCode: merged.errorCode }
      : {}),
    ...(typeof merged.rawErrorMessage === 'string'
      ? { rawErrorMessage: merged.rawErrorMessage }
      : {}),
    ...(typeof merged.failedPhase === 'string'
      ? {
          failedPhase:
            merged.failedPhase as ConversationExecutionMetadata['failedPhase'],
        }
      : {}),
  };
}

export function writeExecutionMetadata(
  baseMetadata: Record<string, unknown>,
  executionMetadata: ConversationExecutionMetadata,
): Record<string, unknown> {
  return {
    ...baseMetadata,
    execution: executionMetadata,
  };
}

export function shouldRefreshConversationRuntimeForPublishedVersion(
  executionMetadata: ConversationExecutionMetadata,
  currentPublishedVersionId?: string,
): boolean {
  if (!currentPublishedVersionId) {
    return false;
  }

  const hasRuntimeState =
    typeof executionMetadata.sessionId === 'string' ||
    (executionMetadata.memorySessionIds?.length ?? 0) > 0;
  if (!hasRuntimeState) {
    return false;
  }

  return (
    normalizeOptionalString(executionMetadata.loadedPublishedVersionId) !==
    currentPublishedVersionId
  );
}

export function buildExecutionMetadataForPublishedVersionRefresh(
  executionMetadata: ConversationExecutionMetadata,
  currentPublishedVersionId?: string,
): ConversationExecutionMetadata {
  return {
    ...(executionMetadata.lastProcessedMessageId
      ? { lastProcessedMessageId: executionMetadata.lastProcessedMessageId }
      : {}),
    ...(executionMetadata.lastAssistantMessageId
      ? { lastAssistantMessageId: executionMetadata.lastAssistantMessageId }
      : {}),
    lastStopReason: 'end_turn',
    runningState: 'idle',
    ...(currentPublishedVersionId
      ? { loadedPublishedVersionId: currentPublishedVersionId }
      : {}),
  };
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
