import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { jsonSchema } from 'ai';
import {
  convertMcpToolToPiTool,
  convertMcpToolsToPiTools,
  type PiAgentTool,
} from '../mcp-tool-bridge';
import type { ToolSet, ToolExecutionOptions } from 'ai';

function makeTool(
  description: string,
  inputSchema: z.ZodTypeAny,
  execute?: (input: unknown, options: ToolExecutionOptions) => Promise<unknown>,
): ToolSet[string] {
  return {
    description,
    inputSchema,
    execute: execute as ToolSet[string]['execute'],
  };
}

describe('convertMcpToolToPiTool()', () => {
  it('copies the tool name to both name and label', () => {
    const tool = makeTool('Get the weather', z.object({ city: z.string() }));
    const result = convertMcpToolToPiTool('get_weather', tool);

    expect(result.name).toBe('get_weather');
    expect(result.label).toBe('get_weather');
  });

  it('copies description from the source tool', () => {
    const tool = makeTool('Search the web', z.object({ query: z.string() }));
    const result = convertMcpToolToPiTool('web_search', tool);

    expect(result.description).toBe('Search the web');
  });

  it('falls back to empty string when description is undefined', () => {
    const tool: ToolSet[string] = { inputSchema: z.object({}) };
    const result = convertMcpToolToPiTool('no_desc', tool);

    expect(result.description).toBe('');
  });

  it('converts Zod parameters to pi-compatible schema', () => {
    const schema = z.object({ n: z.number() });
    const tool = makeTool('Desc', schema);
    const result = convertMcpToolToPiTool('calc', tool);

    expect(result.parameters).toBeDefined();
    expect(typeof result.parameters).toBe('object');
    const params = result.parameters as Record<string, unknown>;
    expect(params).toHaveProperty('type', 'object');
  });

  it('accepts AI jsonSchema wrappers as tool parameters', () => {
    const tool: ToolSet[string] = {
      description: 'Search docs',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      }),
    };

    const result = convertMcpToolToPiTool('search_docs', tool);
    const params = result.parameters as Record<string, unknown>;
    expect(params).toHaveProperty('type', 'object');
    expect(params).toHaveProperty('properties');
  });

  it('returns content[0].text from execute result when result is a string', async () => {
    const tool = makeTool('Echo', z.object({ msg: z.string() }), async (p) => {
      const params = p as { msg: string };
      return params.msg;
    });
    const result = convertMcpToolToPiTool('echo', tool);
    const output = await result.execute('call-1', { msg: 'hello' });

    expect(output.content[0].type).toBe('text');
    expect(output.content[0].text).toBe('hello');
  });

  it('JSON-serializes non-string execute results into content[0].text', async () => {
    const tool = makeTool('Count', z.object({}), async () => ({ count: 42 }));
    const result = convertMcpToolToPiTool('count', tool);
    const output = await result.execute('call-2', {});

    expect(output.content[0].text).toBe(JSON.stringify({ count: 42 }));
    expect(output.details).toEqual({ count: 42 });
  });

  it('returns empty string content when execute result is null', async () => {
    const tool = makeTool('Null', z.object({}), async () => null);
    const result = convertMcpToolToPiTool('nulltool', tool);
    const output = await result.execute('call-3', {});

    expect(output.content[0].text).toBe('');
  });

  it('returns placeholder content when tool has no execute function', async () => {
    const tool: ToolSet[string] = { inputSchema: z.object({}) };
    const result = convertMcpToolToPiTool('noexec', tool);
    const output = await result.execute('call-4', {});

    expect(output.content[0].text).toBe('Tool has no execute function');
  });

  it('passes AbortSignal through to the wrapped execute', async () => {
    const receivedSignals: AbortSignal[] = [];
    const tool = makeTool('Sig', z.object({}), async (_p, opts) => {
      if (opts?.abortSignal) receivedSignals.push(opts.abortSignal);
      return 'ok';
    });
    const result = convertMcpToolToPiTool('sig', tool);
    const controller = new AbortController();
    await result.execute('call-5', {}, controller.signal);

    expect(receivedSignals).toHaveLength(1);
    expect(receivedSignals[0]).toBe(controller.signal);
  });
});

describe('convertMcpToolsToPiTools()', () => {
  it('returns an empty array for an empty toolset', () => {
    expect(convertMcpToolsToPiTools({})).toEqual([]);
  });

  it('converts each tool in the toolset', () => {
    const toolSet: ToolSet = {
      tool_a: makeTool('A', z.object({ x: z.string() })),
      tool_b: makeTool('B', z.object({ y: z.number() })),
    };
    const results = convertMcpToolsToPiTools(toolSet);

    expect(results).toHaveLength(2);
    const names = results.map((t: PiAgentTool) => t.name);
    expect(names).toContain('tool_a');
    expect(names).toContain('tool_b');
  });

  it('preserves descriptions across all converted tools', () => {
    const toolSet: ToolSet = {
      greet: makeTool('Say hello', z.object({ name: z.string() })),
    };
    const [converted] = convertMcpToolsToPiTools(toolSet);

    expect(converted.description).toBe('Say hello');
  });
});
