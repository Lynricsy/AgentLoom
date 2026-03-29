import { streamText } from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import { importPiAi } from './pi-imports';

export type PiCompatContext = {
  systemPrompt?: string;
  messages: unknown[];
  tools?: unknown[];
};

type PiCompatOptions = {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | {
      type: 'toolCall';
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    };

type PartialAssistantMessage = {
  role: 'assistant';
  content: ContentBlock[];
  api: string;
  provider: string;
  model: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
  errorMessage?: string;
  timestamp: number;
};

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
};

type FinalContentPart =
  | {
      type: 'text';
      text?: string;
    }
  | {
      type: 'reasoning';
      text?: string;
    }
  | {
      type: 'tool-call';
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
    };

type DoneStopReason = Extract<
  PartialAssistantMessage['stopReason'],
  'stop' | 'length' | 'toolUse'
>;

function makeEmptyPartial(model: LanguageModel): PartialAssistantMessage {
  const modelRecord = asRecord(model);

  return {
    role: 'assistant',
    content: [],
    api: 'vercel-ai',
    provider:
      typeof modelRecord?.provider === 'string'
        ? modelRecord.provider
        : 'vercel',
    model:
      typeof modelRecord?.modelId === 'string'
        ? modelRecord.modelId
        : 'unknown',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function shallowClonePartial(
  p: PartialAssistantMessage,
): PartialAssistantMessage {
  return {
    ...p,
    content: [...p.content],
    usage: { ...p.usage, cost: { ...p.usage.cost } },
  };
}

function hasMeaningfulContent(partial: PartialAssistantMessage): boolean {
  return partial.content.some((block) => {
    if (block.type === 'text') {
      return block.text.length > 0;
    }

    if (block.type === 'thinking') {
      return block.thinking.length > 0;
    }

    return true;
  });
}

function applyUsage(
  partial: PartialAssistantMessage,
  usage?: UsageLike | null,
): void {
  partial.usage.input = usage?.inputTokens ?? 0;
  partial.usage.output = usage?.outputTokens ?? 0;
  partial.usage.totalTokens = partial.usage.input + partial.usage.output;
}

function mapFinishReason(finishReason: string | undefined): DoneStopReason {
  return finishReason === 'tool-calls'
    ? 'toolUse'
    : finishReason === 'length'
      ? 'length'
      : 'stop';
}

async function safeAwait<T>(
  value: PromiseLike<T> | T,
  fallback: T,
): Promise<T> {
  try {
    return await Promise.resolve(value);
  } catch {
    return fallback;
  }
}

function emitRecoveredContent(
  stream: {
    push: (event: Record<string, unknown>) => void;
  },
  partial: PartialAssistantMessage,
  contentParts: unknown[],
): void {
  for (const rawPart of contentParts) {
    const part = asRecord(rawPart) as FinalContentPart | null;
    if (!part) {
      continue;
    }

    switch (part.type) {
      case 'text': {
        if (typeof part.text !== 'string' || part.text.length === 0) {
          continue;
        }

        partial.content.push({ type: 'text', text: part.text });
        const idx = partial.content.length - 1;
        stream.push({
          type: 'text_start',
          contentIndex: idx,
          partial: shallowClonePartial(partial),
        });
        stream.push({
          type: 'text_delta',
          contentIndex: idx,
          delta: part.text,
          partial: shallowClonePartial(partial),
        });
        stream.push({
          type: 'text_end',
          contentIndex: idx,
          content: part.text,
          partial: shallowClonePartial(partial),
        });
        break;
      }

      case 'reasoning': {
        if (typeof part.text !== 'string' || part.text.length === 0) {
          continue;
        }

        partial.content.push({ type: 'thinking', thinking: part.text });
        const idx = partial.content.length - 1;
        stream.push({
          type: 'thinking_start',
          contentIndex: idx,
          partial: shallowClonePartial(partial),
        });
        stream.push({
          type: 'thinking_delta',
          contentIndex: idx,
          delta: part.text,
          partial: shallowClonePartial(partial),
        });
        stream.push({
          type: 'thinking_end',
          contentIndex: idx,
          content: part.text,
          partial: shallowClonePartial(partial),
        });
        break;
      }

      case 'tool-call': {
        if (
          typeof part.toolCallId !== 'string' ||
          part.toolCallId.length === 0 ||
          typeof part.toolName !== 'string' ||
          part.toolName.length === 0
        ) {
          continue;
        }

        const inputRecord = asRecord(part.input) ?? {};
        partial.content.push({
          type: 'toolCall',
          id: part.toolCallId,
          name: part.toolName,
          arguments: inputRecord,
        });
        const idx = partial.content.length - 1;
        stream.push({
          type: 'toolcall_start',
          contentIndex: idx,
          partial: shallowClonePartial(partial),
        });
        stream.push({
          type: 'toolcall_end',
          contentIndex: idx,
          toolCall: {
            type: 'toolCall',
            id: part.toolCallId,
            name: part.toolName,
            arguments: inputRecord,
          },
          partial: shallowClonePartial(partial),
        });
        break;
      }
    }
  }
}

export function createVercelStreamFn(model: LanguageModel, toolSet?: ToolSet) {
  return async (
    modelOrContext: LanguageModel | PiCompatContext,
    contextOrOptions?: PiCompatContext | PiCompatOptions,
    maybeOptions?: PiCompatOptions,
  ): Promise<unknown> => {
    const piAi = await importPiAi();
    const stream = piAi.createAssistantMessageEventStream();

    const invocation = resolveStreamInvocation(
      model,
      modelOrContext,
      contextOrOptions,
      maybeOptions,
    );
    const partial = makeEmptyPartial(invocation.model);
    stream.push({ type: 'start', partial: shallowClonePartial(partial) });

    const idToContentIndex = new Map<string, number>();

    void (async () => {
      try {
        const streamTextInput: Record<string, unknown> = {
          model: invocation.model,
          system: invocation.context.systemPrompt,
          messages: invocation.context.messages,
        };

        if (invocation.options?.temperature !== undefined) {
          streamTextInput.temperature = invocation.options.temperature;
        }

        if (invocation.options?.maxTokens !== undefined) {
          streamTextInput.maxTokens = invocation.options.maxTokens;
        }

        if (invocation.options?.signal !== undefined) {
          streamTextInput.abortSignal = invocation.options.signal;
        }

        if (toolSet && Object.keys(toolSet).length > 0) {
          streamTextInput.tools = toolSet;
          streamTextInput.toolChoice = 'auto';
        }

        const result = streamText(streamTextInput as never);
        let finishReasonFromStream: string | undefined;
        let usageFromStream: UsageLike | undefined;
        let terminalError:
          | {
              reason: 'aborted' | 'error';
              message: string;
            }
          | undefined;

        for await (const event of result.fullStream) {
          switch (event.type) {
            case 'text-start': {
              partial.content.push({ type: 'text', text: '' });
              const idx = partial.content.length - 1;
              idToContentIndex.set(event.id, idx);
              stream.push({
                type: 'text_start',
                contentIndex: idx,
                partial: shallowClonePartial(partial),
              });
              break;
            }

            case 'text-delta': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as {
                  type: 'text';
                  text: string;
                };
                block.text += event.text;
                stream.push({
                  type: 'text_delta',
                  contentIndex: idx,
                  delta: event.text,
                  partial: shallowClonePartial(partial),
                });
              }
              break;
            }

            case 'text-end': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as {
                  type: 'text';
                  text: string;
                };
                stream.push({
                  type: 'text_end',
                  contentIndex: idx,
                  content: block.text,
                  partial: shallowClonePartial(partial),
                });
              }
              break;
            }

            case 'reasoning-start': {
              partial.content.push({ type: 'thinking', thinking: '' });
              const idx = partial.content.length - 1;
              idToContentIndex.set(event.id, idx);
              stream.push({
                type: 'thinking_start',
                contentIndex: idx,
                partial: shallowClonePartial(partial),
              });
              break;
            }

            case 'reasoning-delta': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as {
                  type: 'thinking';
                  thinking: string;
                };
                block.thinking += event.text;
                stream.push({
                  type: 'thinking_delta',
                  contentIndex: idx,
                  delta: event.text,
                  partial: shallowClonePartial(partial),
                });
              }
              break;
            }

            case 'reasoning-end': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as {
                  type: 'thinking';
                  thinking: string;
                };
                stream.push({
                  type: 'thinking_end',
                  contentIndex: idx,
                  content: block.thinking,
                  partial: shallowClonePartial(partial),
                });
              }
              break;
            }

            case 'tool-input-start': {
              partial.content.push({
                type: 'toolCall',
                id: event.id,
                name: event.toolName,
                arguments: {},
              });
              const idx = partial.content.length - 1;
              idToContentIndex.set(event.id, idx);
              stream.push({
                type: 'toolcall_start',
                contentIndex: idx,
                partial: shallowClonePartial(partial),
              });
              break;
            }

            case 'tool-input-delta': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                stream.push({
                  type: 'toolcall_delta',
                  contentIndex: idx,
                  delta: event.delta,
                  partial: shallowClonePartial(partial),
                });
              }
              break;
            }

            case 'tool-call': {
              const toolEvent = event as {
                type: 'tool-call';
                toolCallId: string;
                toolName: string;
                input: unknown;
              };
              let idx = idToContentIndex.get(toolEvent.toolCallId);
              if (idx === undefined) {
                partial.content.push({
                  type: 'toolCall',
                  id: toolEvent.toolCallId,
                  name: toolEvent.toolName,
                  arguments: {},
                });
                idx = partial.content.length - 1;
                idToContentIndex.set(toolEvent.toolCallId, idx);
                stream.push({
                  type: 'toolcall_start',
                  contentIndex: idx,
                  partial: shallowClonePartial(partial),
                });
              }
              const tc = partial.content[idx] as {
                type: 'toolCall';
                id: string;
                name: string;
                arguments: Record<string, unknown>;
              };
              tc.arguments = (toolEvent.input as Record<string, unknown>) ?? {};
              stream.push({
                type: 'toolcall_end',
                contentIndex: idx,
                toolCall: { ...tc },
                partial: shallowClonePartial(partial),
              });
              break;
            }

            case 'finish': {
              const finishEvent = event as {
                type: 'finish';
                finishReason: string;
                totalUsage: { inputTokens?: number; outputTokens?: number };
              };
              finishReasonFromStream = finishEvent.finishReason;
              usageFromStream = finishEvent.totalUsage;
              break;
            }

            case 'abort': {
              const abortEvent = event as { type: 'abort'; reason?: string };
              terminalError = {
                reason: 'aborted',
                message: abortEvent.reason ?? 'Request aborted',
              };
              break;
            }

            case 'error': {
              const errEvent = event as { type: 'error'; error?: unknown };
              terminalError = {
                reason: 'error',
                message:
                  errEvent.error instanceof Error
                    ? errEvent.error.message
                    : String(errEvent.error ?? 'Unknown error'),
              };
              break;
            }
          }
        }

        if (terminalError) {
          stream.push({
            type: 'error',
            reason: terminalError.reason,
            error: {
              ...shallowClonePartial(partial),
              stopReason:
                terminalError.reason === 'aborted'
                  ? 'aborted'
                  : ('error' as const),
              errorMessage: terminalError.message,
            },
          });
          return;
        }

        if (!hasMeaningfulContent(partial)) {
          const recoveredContent =
            ((await safeAwait(result.content, [] as unknown[])) as unknown[]) ??
            [];
          emitRecoveredContent(stream, partial, recoveredContent);
        }

        const finalUsage =
          usageFromStream ??
          ((await safeAwait(
            result.totalUsage,
            undefined as UsageLike | undefined,
          )) as UsageLike | undefined);
        applyUsage(partial, finalUsage);

        const stopReason = mapFinishReason(
          finishReasonFromStream ??
            ((await safeAwait(
              result.finishReason,
              undefined as string | undefined,
            )) as string | undefined),
        );

        partial.stopReason = stopReason;
        stream.push({
          type: 'done',
          reason: stopReason,
          message: shallowClonePartial(partial),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stream.push({
          type: 'error',
          reason: 'error',
          error: {
            ...shallowClonePartial(partial),
            stopReason: 'error' as const,
            errorMessage: errMsg,
          },
        });
      }
    })();

    return stream;
  };
}

function resolveStreamInvocation(
  boundModel: LanguageModel,
  modelOrContext: LanguageModel | PiCompatContext,
  contextOrOptions?: PiCompatContext | PiCompatOptions,
  maybeOptions?: PiCompatOptions,
): {
  model: LanguageModel;
  context: PiCompatContext;
  options?: PiCompatOptions;
} {
  if (isPiCompatContext(modelOrContext)) {
    return {
      model: boundModel,
      context: modelOrContext,
      options: isPiCompatOptions(contextOrOptions)
        ? contextOrOptions
        : undefined,
    };
  }

  if (isPiCompatContext(contextOrOptions)) {
    return {
      model: modelOrContext,
      context: contextOrOptions,
      options: maybeOptions,
    };
  }

  throw new Error('Invalid pi stream context: messages must be provided');
}

function isPiCompatContext(value: unknown): value is PiCompatContext {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return Array.isArray(record.messages);
}

function isPiCompatOptions(value: unknown): value is PiCompatOptions {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return (
    'temperature' in record ||
    'maxTokens' in record ||
    'signal' in record ||
    Object.keys(record).length === 0
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
