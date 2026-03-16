import { describe, expect, it } from 'vitest';

import { CustomNodeDefinitionSchema, PortDefinitionSchema } from './node-schema';

describe('PortDefinitionSchema', () => {
  it('valid port definition passes', () => {
    const result = PortDefinitionSchema.safeParse({
      id: 'input',
      label: 'Input',
      dataType: 'text',
      required: true,
      description: 'Text input',
    });

    expect(result.success).toBe(true);
  });

  it('invalid dataType fails', () => {
    const result = PortDefinitionSchema.safeParse({
      id: 'input',
      label: 'Input',
      dataType: 'binary',
    });

    expect(result.success).toBe(false);
  });
});

describe('CustomNodeDefinitionSchema', () => {
  it('valid node definition without execute passes', () => {
    const result = CustomNodeDefinitionSchema.safeParse({
      type: 'text-to-uppercase',
      label: 'Uppercase',
      category: 'transform',
      description: 'Convert text to uppercase.',
      inputPorts: [
        {
          id: 'input',
          label: 'Input',
          dataType: 'text',
          required: true,
        },
      ],
      outputPorts: [
        {
          id: 'output',
          label: 'Output',
          dataType: 'text',
        },
      ],
      configSchema: {
        type: 'object',
        properties: {
          trim: { type: 'boolean' },
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
