import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVercelStreamFn } from '../stream-fn.adapter';
import type { PiCompatContext } from '../stream-fn.adapter';

type TextStreamPart = Record<string, unknown> & { type: string };

const { mockStreamText } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
}));

vi.mock('ai', () => ({
  streamText: mockStreamText,
}));

function makeMockModel(provider = 'openai', modelId = 'gpt-4o') {
  return { provider, modelId } as import('ai').LanguageModel;
}

async function* asyncEvents(
  events: TextStreamPart[],
): AsyncIterable<TextStreamPart> {
  for (const e of events) yield e;
}

function makeStreamResult(events: TextStreamPart[]) {
  return {
    fullStream: asyncEvents(events),
    content: Promise.resolve([]),
    totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    finishReason: Promise.resolve('stop'),
  };
}

const baseContext: PiCompatContext = {
  systemPrompt: 'You are helpful.',
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('createVercelStreamFn()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an async function', () => {
    const fn = createVercelStreamFn(makeMockModel());
    expect(typeof fn).toBe('function');
    expect(fn.constructor.name).toBe('AsyncFunction');
  });

  it('emits start event immediately and returns the stream', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 10, outputTokens: 5 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const stream = await fn(baseContext);

    expect(stream).toBeDefined();
    const events: unknown[] = [];
    for await (const e of stream as AsyncIterable<unknown>) {
      events.push(e);
    }
    expect((events[0] as Record<string, string>).type).toBe('start');
  });

  it('maps text-start/delta/end to pi text_start/text_delta/text_end', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'text-start', id: 'txt1' },
        { type: 'text-delta', id: 'txt1', text: 'Hello' },
        { type: 'text-delta', id: 'txt1', text: ' world' },
        { type: 'text-end', id: 'txt1' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 5, outputTokens: 3 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('text_start');
    expect(types).toContain('text_delta');
    expect(types).toContain('text_end');

    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas[0].delta).toBe('Hello');
    expect(deltas[1].delta).toBe(' world');

    const textEnd = events.find((e) => e.type === 'text_end') as Record<
      string,
      unknown
    >;
    expect(textEnd.content).toBe('Hello world');
  });

  it('maps reasoning-start/delta/end to pi thinking_start/thinking_delta/thinking_end', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'reasoning-start', id: 'r1' },
        { type: 'reasoning-delta', id: 'r1', text: 'I think...' },
        { type: 'reasoning-end', id: 'r1' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 5, outputTokens: 10 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('thinking_start');
    expect(types).toContain('thinking_delta');
    expect(types).toContain('thinking_end');

    const delta = events.find((e) => e.type === 'thinking_delta') as Record<
      string,
      unknown
    >;
    expect(delta.delta).toBe('I think...');

    const end = events.find((e) => e.type === 'thinking_end') as Record<
      string,
      unknown
    >;
    expect(end.content).toBe('I think...');
  });

  it('maps tool-input-start/delta + tool-call to toolcall_start/delta/end', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'tool-input-start', id: 'tool1', toolName: 'search' },
        { type: 'tool-input-delta', id: 'tool1', delta: '{"q"' },
        { type: 'tool-input-end', id: 'tool1' },
        {
          type: 'tool-call',
          toolCallId: 'tool1',
          toolName: 'search',
          input: { q: 'hello' },
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          totalUsage: { inputTokens: 8, outputTokens: 4 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('toolcall_start');
    expect(types).toContain('toolcall_delta');
    expect(types).toContain('toolcall_end');

    const end = events.find((e) => e.type === 'toolcall_end') as Record<
      string,
      unknown
    >;
    const toolCall = end.toolCall as Record<string, unknown>;
    expect(toolCall.name).toBe('search');
    expect(toolCall.arguments).toEqual({ q: 'hello' });
  });

  it('maps tool-call without prior tool-input-start to toolcall_start + toolcall_end', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'tool-call',
          toolCallId: 'tc2',
          toolName: 'calculator',
          input: { expr: '1+1' },
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          totalUsage: { inputTokens: 3, outputTokens: 2 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('toolcall_start');
    expect(types).toContain('toolcall_end');
  });

  it('maps finish with tool-calls finishReason to done with reason toolUse', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'tool-calls',
          totalUsage: { inputTokens: 5, outputTokens: 5 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const done = events.find((e) => e.type === 'done') as Record<
      string,
      unknown
    >;
    expect(done).toBeDefined();
    expect(done.reason).toBe('toolUse');
  });

  it('maps finish with length finishReason to done with reason length', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'length',
          totalUsage: { inputTokens: 100, outputTokens: 200 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const done = events.find((e) => e.type === 'done') as Record<
      string,
      unknown
    >;
    expect(done.reason).toBe('length');
    const msg = done.message as Record<string, unknown>;
    const usage = msg.usage as Record<string, unknown>;
    expect(usage.input).toBe(100);
    expect(usage.output).toBe(200);
    expect(usage.totalTokens).toBe(300);
  });

  it('recovers final text content when fullStream only emits finish', async () => {
    mockStreamText.mockReturnValue({
      ...makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 4, outputTokens: 7 },
        },
      ]),
      content: Promise.resolve([{ type: 'text', text: 'Recovered answer' }]),
      totalUsage: Promise.resolve({ inputTokens: 4, outputTokens: 7 }),
      finishReason: Promise.resolve('stop'),
    });

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('text_start');
    expect(types).toContain('text_delta');
    expect(types).toContain('text_end');

    const delta = events.find((e) => e.type === 'text_delta') as Record<
      string,
      unknown
    >;
    expect(delta.delta).toBe('Recovered answer');

    const done = events.find((e) => e.type === 'done') as Record<
      string,
      unknown
    >;
    const message = done.message as Record<string, unknown>;
    expect(message.content).toEqual([
      { type: 'text', text: 'Recovered answer' },
    ]);
  });

  it('recovers final tool call content when fullStream only emits finish', async () => {
    mockStreamText.mockReturnValue({
      ...makeStreamResult([
        {
          type: 'finish',
          finishReason: 'tool-calls',
          totalUsage: { inputTokens: 6, outputTokens: 3 },
        },
      ]),
      content: Promise.resolve([
        {
          type: 'tool-call',
          toolCallId: 'recovered-tool',
          toolName: 'search',
          input: { q: 'agentloom' },
        },
      ]),
      totalUsage: Promise.resolve({ inputTokens: 6, outputTokens: 3 }),
      finishReason: Promise.resolve('tool-calls'),
    });

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('toolcall_start');
    expect(types).toContain('toolcall_end');

    const toolcallEnd = events.find((e) => e.type === 'toolcall_end') as Record<
      string,
      unknown
    >;
    expect(toolcallEnd.toolCall).toEqual({
      type: 'toolCall',
      id: 'recovered-tool',
      name: 'search',
      arguments: { q: 'agentloom' },
    });

    const done = events.find((e) => e.type === 'done') as Record<
      string,
      unknown
    >;
    expect(done.reason).toBe('toolUse');
  });

  it('maps abort event to pi error with reason aborted', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([{ type: 'abort', reason: 'User cancelled' }]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const err = events.find((e) => e.type === 'error') as Record<
      string,
      unknown
    >;
    expect(err).toBeDefined();
    expect(err.reason).toBe('aborted');
  });

  it('maps error event to pi error with reason error', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([{ type: 'error', error: new Error('LLM failed') }]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const err = events.find((e) => e.type === 'error') as Record<
      string,
      unknown
    >;
    expect(err).toBeDefined();
    expect(err.reason).toBe('error');
    const errMsg = (err.error as Record<string, unknown>)
      .errorMessage as string;
    expect(errMsg).toContain('LLM failed');
  });

  it('emits error event when streamText throws', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const err = events.find((e) => e.type === 'error') as Record<
      string,
      unknown
    >;
    expect(err).toBeDefined();
    const errMsg = (err.error as Record<string, unknown>)
      .errorMessage as string;
    expect(errMsg).toContain('Connection failed');
  });

  it('partial AssistantMessage has correct provider and model from LanguageModel', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(
      makeMockModel('anthropic', 'claude-3-7-sonnet'),
    );
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const start = events[0];
    const partial = start.partial as Record<string, unknown>;
    expect(partial.provider).toBe('anthropic');
    expect(partial.model).toBe('claude-3-7-sonnet');
    expect(partial.role).toBe('assistant');
  });

  it('passes systemPrompt and messages to streamText', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 2, outputTokens: 2 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    await fn({
      systemPrompt: 'Be helpful',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'Be helpful',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    );
  });

  it('supports pi-mono StreamFn(model, context, options) signature', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 2, outputTokens: 2 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel('openai', 'bound-model'));
    const runtimeModel = makeMockModel('anthropic', 'runtime-model');
    const controller = new AbortController();

    await fn(
      runtimeModel,
      {
        systemPrompt: 'Use runtime context',
        messages: [{ role: 'user', content: 'hello from runtime' }],
      },
      {
        temperature: 0.3,
        maxTokens: 128,
        signal: controller.signal,
      },
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: runtimeModel,
        system: 'Use runtime context',
        messages: [{ role: 'user', content: 'hello from runtime' }],
        temperature: 0.3,
        maxTokens: 128,
        abortSignal: controller.signal,
      }),
    );
  });

  it('text-delta with unknown id is silently dropped', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'text-delta', id: 'unknown-id', text: 'dropped' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).not.toContain('text_delta');
    expect(types).toContain('start');
    expect(types).toContain('done');
  });

  it('text-end with unknown id is silently dropped', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'text-end', id: 'unknown-id' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).not.toContain('text_end');
  });

  it('reasoning-delta with unknown id is silently dropped', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'reasoning-delta', id: 'unknown-id', text: 'dropped' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).not.toContain('thinking_delta');
  });

  it('reasoning-end with unknown id is silently dropped', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'reasoning-end', id: 'unknown-id' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).not.toContain('thinking_end');
  });

  it('tool-input-delta with unknown id is silently dropped', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'tool-input-delta', id: 'unknown-id', delta: '{"dropped"}' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).not.toContain('toolcall_delta');
  });

  it('error event with non-Error value stringifies it', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([{ type: 'error', error: 'plain string error' }]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const err = events.find((e) => e.type === 'error') as Record<
      string,
      unknown
    >;
    expect(err).toBeDefined();
    const errMsg = (err.error as Record<string, unknown>)
      .errorMessage as string;
    expect(errMsg).toBe('plain string error');
  });

  it('error event with undefined error uses "Unknown error"', async () => {
    mockStreamText.mockReturnValue(makeStreamResult([{ type: 'error' }]));

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const err = events.find((e) => e.type === 'error') as Record<
      string,
      unknown
    >;
    const errMsg = (err.error as Record<string, unknown>)
      .errorMessage as string;
    expect(errMsg).toBe('Unknown error');
  });

  it('abort without reason defaults to "Request aborted"', async () => {
    mockStreamText.mockReturnValue(makeStreamResult([{ type: 'abort' }]));

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const err = events.find((e) => e.type === 'error') as Record<
      string,
      unknown
    >;
    expect(err.reason).toBe('aborted');
    const errMsg = (err.error as Record<string, unknown>)
      .errorMessage as string;
    expect(errMsg).toBe('Request aborted');
  });

  it('catch block handles non-Error thrown value', async () => {
    mockStreamText.mockImplementation(() => ({
      fullStream: (async function* () {
        yield* [];
        throw 'raw string thrown';
      })(),
    }));

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const err = events.find((e) => e.type === 'error') as Record<
      string,
      unknown
    >;
    expect(err).toBeDefined();
    const errMsg = (err.error as Record<string, unknown>)
      .errorMessage as string;
    expect(errMsg).toBe('raw string thrown');
  });

  it('model without provider/modelId defaults to "vercel"/"unknown"', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn({} as import('ai').LanguageModel);
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const start = events[0];
    const partial = start.partial as Record<string, unknown>;
    expect(partial.provider).toBe('vercel');
    expect(partial.model).toBe('unknown');
  });

  it('model that is null falls back to "vercel"/"unknown"', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(
      null as unknown as import('ai').LanguageModel,
    );
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const start = events[0];
    const partial = start.partial as Record<string, unknown>;
    expect(partial.provider).toBe('vercel');
    expect(partial.model).toBe('unknown');
  });

  it('model that is an array falls back to "vercel"/"unknown"', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(
      [] as unknown as import('ai').LanguageModel,
    );
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const start = events[0];
    const partial = start.partial as Record<string, unknown>;
    expect(partial.provider).toBe('vercel');
    expect(partial.model).toBe('unknown');
  });

  it('finish with unknown finishReason defaults to stop', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'content-filter',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const done = events.find((e) => e.type === 'done') as Record<
      string,
      unknown
    >;
    expect(done.reason).toBe('stop');
  });

  it('passes toolSet to streamText when non-empty', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const toolSet = {
      search: { description: 'search', parameters: {} },
    } as unknown as import('ai').ToolSet;
    const fn = createVercelStreamFn(makeMockModel(), toolSet);
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: toolSet,
        toolChoice: 'auto',
      }),
    );
  });

  it('does not pass tools when toolSet is empty', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel(), {});
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.tools).toBeUndefined();
    expect(call.toolChoice).toBeUndefined();
  });

  it('finish with missing totalUsage defaults to zero tokens', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'finish', finishReason: 'stop', totalUsage: {} },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const done = events.find((e) => e.type === 'done') as Record<
      string,
      unknown
    >;
    const msg = done.message as Record<string, unknown>;
    const usage = msg.usage as Record<string, unknown>;
    expect(usage.input).toBe(0);
    expect(usage.output).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });

  it('tool-call with null input defaults to empty arguments', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        {
          type: 'tool-call',
          toolCallId: 'tc-null',
          toolName: 'noop',
          input: null,
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const end = events.find((e) => e.type === 'toolcall_end') as Record<
      string,
      unknown
    >;
    const toolCall = end.toolCall as Record<string, unknown>;
    expect(toolCall.arguments).toEqual({});
  });

  it('unknown event type in fullStream is silently ignored', async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([
        { type: 'step-start' } as TextStreamPart,
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    );

    const fn = createVercelStreamFn(makeMockModel());
    const events: Record<string, unknown>[] = [];
    for await (const e of (await fn(baseContext)) as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toEqual(['start', 'done']);
  });
});
