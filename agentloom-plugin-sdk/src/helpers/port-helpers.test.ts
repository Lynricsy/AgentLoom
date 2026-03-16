import { describe, expect, it } from 'vitest';

import { defineInputPort, defineNode, defineOutputPort } from './port-helpers';

describe('defineInputPort', () => {
  it('creates correct structure', () => {
    const port = defineInputPort({
      id: 'input',
      label: 'Input',
      dataType: 'text',
      required: true,
      description: 'Input text',
    });

    expect(port).toEqual({
      id: 'input',
      label: 'Input',
      dataType: 'text',
      required: true,
      description: 'Input text',
    });
  });
});

describe('defineOutputPort', () => {
  it('creates correct structure without required field', () => {
    const port = defineOutputPort({
      id: 'output',
      label: 'Output',
      dataType: 'json',
      description: 'Result payload',
    });

    expect(port).toEqual({
      id: 'output',
      label: 'Output',
      dataType: 'json',
      description: 'Result payload',
    });
    expect(port).not.toHaveProperty('required');
  });
});

describe('defineNode', () => {
  it('returns a frozen object', () => {
    const node = {
      type: 'text-to-uppercase',
      label: 'Uppercase',
      category: 'transform' as const,
      description: 'Convert text to uppercase.',
      inputPorts: [
        {
          id: 'input',
          label: 'Input',
          dataType: 'text' as const,
        },
      ],
      outputPorts: [
        {
          id: 'output',
          label: 'Output',
          dataType: 'text' as const,
        },
      ],
      execute: async () => ({
        outputs: {
          output: 'HELLO',
        },
      }),
    };

    const definedNode = defineNode(node);

    expect(Object.isFrozen(definedNode)).toBe(true);
  });

  it('returns the same object reference', () => {
    const node = {
      type: 'text-to-uppercase',
      label: 'Uppercase',
      category: 'transform' as const,
      description: 'Convert text to uppercase.',
      inputPorts: [
        {
          id: 'input',
          label: 'Input',
          dataType: 'text' as const,
        },
      ],
      outputPorts: [
        {
          id: 'output',
          label: 'Output',
          dataType: 'text' as const,
        },
      ],
      execute: async () => ({
        outputs: {},
      }),
    };

    const definedNode = defineNode(node);

    expect(definedNode).toBe(node);
    expect(definedNode.inputPorts).toBe(node.inputPorts);
    expect(definedNode.outputPorts).toBe(node.outputPorts);
  });
});
