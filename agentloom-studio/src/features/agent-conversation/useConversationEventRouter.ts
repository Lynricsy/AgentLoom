import { useCallback, useRef } from 'react';

import type {
  SubAgentEventEnvelope,
  SubAgentEvent,
  SubAgentStream,
  SubAgentHandle,
} from './types';

export interface ConversationEventRouterResult {
  routeEvent: (
    eventType: SubAgentEvent['type'],
    payload: unknown,
    subagent?: SubAgentEventEnvelope,
  ) => {
    isSubAgent: boolean;
    handle?: SubAgentHandle;
  };
  getStream: (handle: SubAgentHandle) => SubAgentStream | undefined;
  getAllStreams: () => Map<string, SubAgentStream>;
  updateStreamStatus: (
    handle: SubAgentHandle,
    status: SubAgentStream['status'],
    error?: string,
  ) => void;
  resetStreams: () => void;
}

export function useConversationEventRouter(
  onSubAgentEvent: (handle: SubAgentHandle, stream: SubAgentStream) => void,
): ConversationEventRouterResult {
  const streamsRef = useRef<Map<string, SubAgentStream>>(new Map());

  const ensureStream = useCallback(
    (envelope: SubAgentEventEnvelope): SubAgentStream => {
      const existing = streamsRef.current.get(envelope.handle);
      if (existing) return existing;

      const stream: SubAgentStream = {
        handle: envelope.handle,
        alias: envelope.alias,
        depth: envelope.depth,
        parentToolCallId: envelope.parentToolCallId,
        status: 'running',
        events: [],
        startedAt: Date.now(),
      };
      streamsRef.current.set(envelope.handle, stream);
      return stream;
    },
    [],
  );

  const routeEvent = useCallback(
    (
      eventType: SubAgentEvent['type'],
      payload: unknown,
      subagent?: SubAgentEventEnvelope,
    ) => {
      if (!subagent) {
        return { isSubAgent: false };
      }

      const stream = ensureStream(subagent);
      const event: SubAgentEvent = {
        id: crypto.randomUUID(),
        type: eventType,
        payload,
        timestamp: Date.now(),
      };

      stream.events.push(event);

      if (eventType === 'done') {
        stream.status = stream.status === 'running' ? 'completed' : stream.status;
        stream.completedAt = Date.now();
      }

      onSubAgentEvent(subagent.handle, { ...stream });

      return { isSubAgent: true, handle: subagent.handle };
    },
    [ensureStream, onSubAgentEvent],
  );

  const getStream = useCallback((handle: SubAgentHandle) => {
    return streamsRef.current.get(handle);
  }, []);

  const getAllStreams = useCallback(() => {
    return new Map(streamsRef.current);
  }, []);

  const updateStreamStatus = useCallback(
    (
      handle: SubAgentHandle,
      status: SubAgentStream['status'],
      error?: string,
    ) => {
      const stream = streamsRef.current.get(handle);
      if (!stream) return;

      stream.status = status;
      if (error) stream.error = error;
      if (
        status === 'completed' ||
        status === 'failed' ||
        status === 'timeout' ||
        status === 'cancelled'
      ) {
        stream.completedAt ??= Date.now();
      }

      onSubAgentEvent(handle, { ...stream });
    },
    [onSubAgentEvent],
  );

  const resetStreams = useCallback(() => {
    streamsRef.current = new Map();
  }, []);

  return {
    routeEvent,
    getStream,
    getAllStreams,
    updateStreamStatus,
    resetStreams,
  };
}
