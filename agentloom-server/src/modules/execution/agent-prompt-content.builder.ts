import {
  ContentBlockSchema,
  type ContentBlock,
} from '../agent/types/content-block.types';

type AgentPromptSubAgentResults = Record<string, unknown>;

export function buildAgentPromptContentBlocks(params: {
  input: Record<string, unknown>;
  subAgentResults?: AgentPromptSubAgentResults;
}): ContentBlock[] {
  const modalBlocks = collectModalBlocks(params.input);
  const primaryText = extractPrimaryTextInput(params.input);
  const normalizedInput = sanitizePromptInput(
    omitPrimaryTextInput(params.input),
  );
  const payload =
    params.subAgentResults && Object.keys(params.subAgentResults).length > 0
      ? {
          ...(hasMeaningfulValue(normalizedInput)
            ? { input: normalizedInput }
            : {}),
          subAgents: params.subAgentResults,
        }
      : normalizedInput;
  const summarizedPayload = summarizeForText(payload);
  const textSections = [
    ...(primaryText ? [primaryText] : []),
    ...(hasMeaningfulValue(summarizedPayload)
      ? [JSON.stringify(summarizedPayload)]
      : []),
  ];

  return [
    {
      type: 'text',
      text: textSections.length > 0 ? textSections.join('\n\n') : '{}',
    },
    ...modalBlocks,
  ];
}

function extractPrimaryTextInput(
  input: Record<string, unknown>,
): string | undefined {
  const directText = input['text-in'] ?? input['text-input'];
  if (typeof directText === 'string' && directText.trim().length > 0) {
    return directText;
  }

  const legacyText = input.textInput;
  if (typeof legacyText === 'string' && legacyText.trim().length > 0) {
    return legacyText;
  }

  return undefined;
}

function omitPrimaryTextInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedInput = { ...input };
  delete normalizedInput['text-in'];
  delete normalizedInput['text-input'];
  delete normalizedInput.textInput;
  return normalizedInput;
}

function sanitizePromptInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === 'sandbox-in' || key === 'sandbox') {
      continue;
    }

    if ((key === 'context-in' || key === 'context') && isRuntimeResourceReference(value)) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function collectModalBlocks(value: unknown): ContentBlock[] {
  const parsed = ContentBlockSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data.type === 'text' ? [] : [parsed.data];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectModalBlocks(item));
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((item) => collectModalBlocks(item));
  }

  return [];
}

function summarizeForText(value: unknown): unknown {
  const parsed = ContentBlockSchema.safeParse(value);
  if (parsed.success) {
    switch (parsed.data.type) {
      case 'text':
        return parsed.data.text;
      case 'image':
        return `[image:${parsed.data.mimeType}]`;
      case 'audio':
        return `[audio:${parsed.data.mimeType}]`;
      case 'resource':
        return parsed.data.text ?? `[resource:${parsed.data.uri}]`;
      case 'resource_link':
        return parsed.data.title ?? `[resource_link:${parsed.data.uri}]`;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => summarizeForText(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, summarizeForText(item)]),
    );
  }

  return value;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }

  return true;
}

function isRuntimeResourceReference(value: unknown): boolean {
  return isSandboxReference(value) || isMemorySessionReference(value);
}

function isSandboxReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.status === 'string'
  );
}

function isMemorySessionReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.instanceId === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
