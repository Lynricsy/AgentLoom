import type {
  AgentLoomPlugin,
  CustomNodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
} from '@agentloom/plugin-sdk';
import manifest from '../manifest.json' with { type: 'json' };

const textToUppercaseNode: CustomNodeDefinition = {
  type: 'text-to-uppercase',
  label: 'Text to Uppercase',
  category: 'transform',
  description: 'Converts input text to uppercase with optional prefix and suffix',
  inputPorts: [
    { id: 'text-in', label: 'Text Input', dataType: 'text', required: true },
  ],
  outputPorts: [
    { id: 'text-out', label: 'Text Output', dataType: 'text' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string', title: 'Prefix', description: 'Text to prepend' },
      suffix: { type: 'string', title: 'Suffix', description: 'Text to append' },
    },
  },
  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = String(context.inputs['text-in'] ?? '');
    const prefix = String(context.config.prefix ?? '');
    const suffix = String(context.config.suffix ?? '');
    const result = `${prefix}${input.toUpperCase()}${suffix}`;
    context.logger.info(`Transformed: "${input}" → "${result}"`);
    return { outputs: { 'text-out': result } };
  },
};

const plugin: AgentLoomPlugin = {
  manifest: manifest as AgentLoomPlugin['manifest'],
  nodes: [textToUppercaseNode],
  async activate() {
    return Promise.resolve();
  },
  async deactivate() {
    return Promise.resolve();
  },
};

export default plugin;
