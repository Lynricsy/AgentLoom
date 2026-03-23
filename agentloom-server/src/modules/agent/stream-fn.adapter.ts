import { streamText } from 'ai';
import type { LanguageModel, ToolSet, CoreMessage } from 'ai';
import { importPiAi } from './pi-imports';

export type PiCompatContext = {
  systemPrompt?: string;
  messages: unknown[];
  tools?: unknown[];
};

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> };

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
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  };
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
  errorMessage?: string;
  timestamp: number;
};

function makeEmptyPartial(model: LanguageModel): PartialAssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'vercel-ai',
    provider: model.provider ?? 'vercel',
    model: model.modelId ?? 'unknown',
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

function shallowClonePartial(p: PartialAssistantMessage): PartialAssistantMessage {
  return { ...p, content: [...p.content], usage: { ...p.usage, cost: { ...p.usage.cost } } };
}

export function createVercelStreamFn(model: LanguageModel, toolSet?: ToolSet) {
  return async (context: PiCompatContext): Promise<unknown> => {
    const piAi = await importPiAi();
    const stream = new piAi.AssistantMessageEventStream();

    const partial = makeEmptyPartial(model);
    stream.push({ type: 'start', partial: shallowClonePartial(partial) });

    const idToContentIndex = new Map<string, number>();

    (async () => {
      try {
        const result = streamText({
          model,
          system: context.systemPrompt,
          messages: context.messages as CoreMessage[],
          ...(toolSet && Object.keys(toolSet).length > 0
            ? { tools: toolSet, toolChoice: 'auto' as const }
            : {}),
        });

        for await (const event of result.fullStream) {
          switch (event.type) {
            case 'text-start': {
              partial.content.push({ type: 'text', text: '' });
              const idx = partial.content.length - 1;
              idToContentIndex.set(event.id, idx);
              stream.push({ type: 'text_start', contentIndex: idx, partial: shallowClonePartial(partial) });
              break;
            }

            case 'text-delta': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as { type: 'text'; text: string };
                block.text += event.text;
                stream.push({ type: 'text_delta', contentIndex: idx, delta: event.text, partial: shallowClonePartial(partial) });
              }
              break;
            }

            case 'text-end': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as { type: 'text'; text: string };
                stream.push({ type: 'text_end', contentIndex: idx, content: block.text, partial: shallowClonePartial(partial) });
              }
              break;
            }

            case 'reasoning-start': {
              partial.content.push({ type: 'thinking', thinking: '' });
              const idx = partial.content.length - 1;
              idToContentIndex.set(event.id, idx);
              stream.push({ type: 'thinking_start', contentIndex: idx, partial: shallowClonePartial(partial) });
              break;
            }

            case 'reasoning-delta': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as { type: 'thinking'; thinking: string };
                block.thinking += event.text;
                stream.push({ type: 'thinking_delta', contentIndex: idx, delta: event.text, partial: shallowClonePartial(partial) });
              }
              break;
            }

            case 'reasoning-end': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                const block = partial.content[idx] as { type: 'thinking'; thinking: string };
                stream.push({ type: 'thinking_end', contentIndex: idx, content: block.thinking, partial: shallowClonePartial(partial) });
              }
              break;
            }

            case 'tool-input-start': {
              partial.content.push({ type: 'toolCall', id: event.id, name: event.toolName, arguments: {} });
              const idx = partial.content.length - 1;
              idToContentIndex.set(event.id, idx);
              stream.push({ type: 'toolcall_start', contentIndex: idx, partial: shallowClonePartial(partial) });
              break;
            }

            case 'tool-input-delta': {
              const idx = idToContentIndex.get(event.id);
              if (idx !== undefined) {
                stream.push({ type: 'toolcall_delta', contentIndex: idx, delta: event.delta, partial: shallowClonePartial(partial) });
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
                partial.content.push({ type: 'toolCall', id: toolEvent.toolCallId, name: toolEvent.toolName, arguments: {} });
                idx = partial.content.length - 1;
                idToContentIndex.set(toolEvent.toolCallId, idx);
                stream.push({ type: 'toolcall_start', contentIndex: idx, partial: shallowClonePartial(partial) });
              }
              const tc = partial.content[idx] as { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> };
              tc.arguments = (toolEvent.input as Record<string, unknown>) ?? {};
              stream.push({ type: 'toolcall_end', contentIndex: idx, toolCall: { ...tc }, partial: shallowClonePartial(partial) });
              break;
            }

            case 'finish': {
              const finishEvent = event as {
                type: 'finish';
                finishReason: string;
                totalUsage: { inputTokens?: number; outputTokens?: number };
              };
              partial.usage.input = finishEvent.totalUsage?.inputTokens ?? 0;
              partial.usage.output = finishEvent.totalUsage?.outputTokens ?? 0;
              partial.usage.totalTokens = (partial.usage.input) + (partial.usage.output);

              const stopReason =
                finishEvent.finishReason === 'tool-calls' ? 'toolUse' :
                finishEvent.finishReason === 'length' ? 'length' :
                'stop';

              partial.stopReason = stopReason;
              stream.push({ type: 'done', reason: stopReason as 'stop' | 'length' | 'toolUse', message: shallowClonePartial(partial) });
              break;
            }

            case 'abort': {
              const abortEvent = event as { type: 'abort'; reason?: string };
              stream.push({ type: 'error', reason: 'aborted', error: { ...shallowClonePartial(partial), stopReason: 'aborted' as const, errorMessage: abortEvent.reason ?? 'Request aborted' } });
              break;
            }

            case 'error': {
              const errEvent = event as { type: 'error'; error?: unknown };
              const errMsg = errEvent.error instanceof Error ? errEvent.error.message : String(errEvent.error ?? 'Unknown error');
              stream.push({ type: 'error', reason: 'error', error: { ...shallowClonePartial(partial), stopReason: 'error' as const, errorMessage: errMsg } });
              break;
            }
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stream.push({ type: 'error', reason: 'error', error: { ...shallowClonePartial(partial), stopReason: 'error' as const, errorMessage: errMsg } });
      }
    })();

    return stream;
  };
}
