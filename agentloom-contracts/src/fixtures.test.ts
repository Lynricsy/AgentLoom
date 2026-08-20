import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AgentRuntimeConfigSchema } from './agent-runtime-config';
import {
  EXECUTION_EVENT_NAMES,
  EXECUTION_EVENT_PAYLOAD_SCHEMAS,
  ExecutionStateSnapshotSchema,
  parseExecutionEvent,
  type ExecutionEventName,
} from './execution-events';

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures');
const EVENT_FIXTURES_DIR = join(FIXTURES_DIR, 'execution-events');

/** payload fixture 文件名 → 事件名。 */
const PAYLOAD_FIXTURES: Record<string, ExecutionEventName> = {
  'execution-status-changed.json': 'execution.status.changed',
  'node-status-changed.json': 'execution.node.status-changed',
  'node-agent-event.json': 'execution.node.agent-event',
  'node-retrying.json': 'execution.node.retrying',
  'node-output-chunk.json': 'execution.node.output-chunk',
  'node-intervention-required.json': 'execution.node.intervention-required',
  'node-intervention-resolved.json': 'execution.node.intervention-resolved',
  'node-tool-call-status.json': 'execution.node.tool-call-status',
  'node-tool-permission-required.json':
    'execution.node.tool-permission-required',
  'node-tool-permission-resolved.json':
    'execution.node.tool-permission-resolved',
};

function readFixture(...segments: string[]): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, ...segments), 'utf8'));
}

describe('contracts fixtures', () => {
  it('事件信封 fixture 通过精确校验', () => {
    const parsed = parseExecutionEvent(
      readFixture('execution-event-envelope.json'),
    );

    expect(parsed.event).toBe('execution.status.changed');
    expect(parsed.eventId).toBe(7);
    expect(parsed.tenantId).toBe('0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88');
  });

  it('回放快照 fixture 通过校验，且 result/checkpointData/lastEventId 恒存在', () => {
    const snapshot = ExecutionStateSnapshotSchema.parse(
      readFixture('execution-state-snapshot.json'),
    );

    expect(snapshot.lastEventId).toBe(7);
    for (const step of snapshot.steps) {
      expect(step).toHaveProperty('result');
      expect(step).toHaveProperty('checkpointData');
    }
  });

  it('payload fixture 覆盖全部事件名且文件集合无遗漏', () => {
    const files = readdirSync(EVENT_FIXTURES_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort();

    expect(files).toEqual(Object.keys(PAYLOAD_FIXTURES).sort());
    expect(Object.values(PAYLOAD_FIXTURES).sort()).toEqual(
      [...EXECUTION_EVENT_NAMES].sort(),
    );
  });

  for (const [file, eventName] of Object.entries(PAYLOAD_FIXTURES)) {
    it(`${file} 通过 ${eventName} 的载荷 schema`, () => {
      const payload = readFixture('execution-events', file);

      expect(() =>
        EXECUTION_EVENT_PAYLOAD_SCHEMAS[eventName].parse(payload),
      ).not.toThrow();
    });
  }

  it('agent runtime config fixture 通过校验并保持 canonical 字段名', () => {
    const config = AgentRuntimeConfigSchema.parse(
      readFixture('agent-runtime-config.json'),
    );

    expect(config.knowledgeBindings?.[0]?.similarityThreshold).toBe(0.75);
    expect(config.routingConfig?.fallbackModelId).toBeDefined();
    expect(config.routingConfig?.candidateModelIds).toHaveLength(1);
    expect(config.subAgents?.[0]?.alias).toBe('reviewer');
    expect(config.modelConfig?.modelId).toBeTruthy();
  });

  it('旧别名字段不会被当作 canonical 字段接受', () => {
    const parsed = AgentRuntimeConfigSchema.parse({
      knowledgeBindings: [
        { knowledgeBaseId: 'kb-1', enabled: true, scoreThreshold: 0.5 },
      ],
    });

    expect(parsed.knowledgeBindings?.[0]).not.toHaveProperty('scoreThreshold');
    expect(parsed.knowledgeBindings?.[0]?.similarityThreshold).toBeUndefined();
  });
});
