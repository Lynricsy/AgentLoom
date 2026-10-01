import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AGENT_API_STREAM_EVENT_NAMES,
  AgentApiStreamEventSchema,
} from './agent-api-events';

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures', 'agent-api');

function loadFixtures(): Array<{ file: string; value: unknown }> {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      file,
      value: JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8')),
    }));
}

describe('agent api stream event fixtures', () => {
  it('每个 fixture 都能通过 SSE 事件 schema 精确校验', () => {
    for (const { file, value } of loadFixtures()) {
      const result = AgentApiStreamEventSchema.safeParse(value);
      expect(result.success, `${file}: ${result.error?.message}`).toBe(true);
    }
  });

  it('fixture 覆盖全部对外事件名', () => {
    const covered = new Set(
      loadFixtures().map(
        ({ value }) => AgentApiStreamEventSchema.parse(value).event,
      ),
    );
    expect([...covered].sort()).toEqual([...AGENT_API_STREAM_EVENT_NAMES].sort());
  });

  it('message.delta 的 index 不能为负，run.status 不接受终态', () => {
    expect(
      AgentApiStreamEventSchema.safeParse({
        event: 'message.delta',
        data: {
          runId: '01928c3e-6666-7c3e-9a51-0f7c1d2e3a40',
          index: -1,
          delta: 'x',
        },
      }).success,
    ).toBe(false);
    expect(
      AgentApiStreamEventSchema.safeParse({
        event: 'run.status',
        data: {
          runId: '01928c3e-6666-7c3e-9a51-0f7c1d2e3a40',
          status: 'completed',
        },
      }).success,
    ).toBe(false);
  });
});
