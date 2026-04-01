export type ConversationMessageSegmentRecord =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'thinking';
      content: string;
    }
  | {
      type: 'tool_call';
      toolCallId: string;
    };

export function appendTextConversationMessageSegment(
  segments: ConversationMessageSegmentRecord[],
  content: string,
): ConversationMessageSegmentRecord[] {
  if (content.length === 0) {
    return segments;
  }

  const lastSegment = segments.at(-1);
  if (lastSegment?.type === 'text') {
    return [
      ...segments.slice(0, -1),
      {
        type: 'text',
        content: lastSegment.content + content,
      } satisfies ConversationMessageSegmentRecord,
    ];
  }

  return [
    ...segments,
    { type: 'text', content } satisfies ConversationMessageSegmentRecord,
  ];
}

export function appendThinkingConversationMessageSegment(
  segments: ConversationMessageSegmentRecord[],
  content: string,
): ConversationMessageSegmentRecord[] {
  if (content.length === 0) {
    return segments;
  }

  const lastSegment = segments.at(-1);
  if (lastSegment?.type === 'thinking') {
    return [
      ...segments.slice(0, -1),
      {
        type: 'thinking',
        content: lastSegment.content + content,
      } satisfies ConversationMessageSegmentRecord,
    ];
  }

  return [
    ...segments,
    { type: 'thinking', content } satisfies ConversationMessageSegmentRecord,
  ];
}

export function ensureToolCallConversationMessageSegment(
  segments: ConversationMessageSegmentRecord[],
  toolCallId: string,
): ConversationMessageSegmentRecord[] {
  if (toolCallId.length === 0) {
    return segments;
  }

  const exists = segments.some(
    (segment) =>
      segment.type === 'tool_call' && segment.toolCallId === toolCallId,
  );
  if (exists) {
    return segments;
  }

  return [
    ...segments,
    {
      type: 'tool_call',
      toolCallId,
    } satisfies ConversationMessageSegmentRecord,
  ];
}

export function normalizeConversationMessageSegments(
  value: unknown,
): ConversationMessageSegmentRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ConversationMessageSegmentRecord[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    switch (entry.type) {
      case 'text':
      case 'thinking': {
        const content = readString(entry.content);
        if (!content) {
          continue;
        }
        normalized.push({
          type: entry.type,
          content,
        } satisfies ConversationMessageSegmentRecord);
        break;
      }
      case 'tool_call': {
        const toolCallId = readString(entry.toolCallId);
        if (!toolCallId) {
          continue;
        }
        normalized.push({
          type: 'tool_call',
          toolCallId,
        } satisfies ConversationMessageSegmentRecord);
        break;
      }
      default:
        break;
    }
  }

  return normalized;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
