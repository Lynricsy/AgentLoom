import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';

import type { ApiEventTriggerConfig } from '../../../database/schema/workflow-triggers.schema';
import type { EventPayload } from '../adapters/event-source.adapter';
import { GithubWebhookAdapter } from '../adapters/github-webhook.adapter';

describe('GithubWebhookAdapter', () => {
  let adapter: GithubWebhookAdapter;

  const secret = 'test-webhook-secret';

  function createSignature(body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  function createPayload(
    overrides: Partial<EventPayload> & {
      rawBody?: string;
      headers?: Record<string, string>;
    } = {},
  ): EventPayload {
    const rawBody = overrides.rawBody ?? '{"action":"opened"}';
    const headers = overrides.headers ?? {
      'x-hub-signature-256': createSignature(rawBody),
    };
    return {
      source: 'github',
      type: overrides.type ?? 'push',
      data: { rawBody, headers, ...overrides.data },
      receivedAt: new Date(),
    };
  }

  const config: ApiEventTriggerConfig = {
    eventSource: 'github',
    eventType: 'push',
    secret,
  };

  beforeEach(() => {
    adapter = new GithubWebhookAdapter();
  });

  describe('name', () => {
    it('should be "github"', () => {
      expect(adapter.name).toBe('github');
    });
  });

  describe('validateEvent', () => {
    it('should return true for valid HMAC-SHA256 signature', () => {
      const payload = createPayload();
      expect(adapter.validateEvent(payload, config)).toBe(true);
    });

    it('should return false for invalid HMAC-SHA256 signature', () => {
      const payload = createPayload({
        headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      });
      expect(adapter.validateEvent(payload, config)).toBe(false);
    });

    it('should return false when X-Hub-Signature-256 header is missing', () => {
      const payload = createPayload({ headers: {} });
      expect(adapter.validateEvent(payload, config)).toBe(false);
    });

    it('should return false when headers object is missing', () => {
      const payload: EventPayload = {
        source: 'github',
        type: 'push',
        data: { rawBody: '{}' },
        receivedAt: new Date(),
      };
      expect(adapter.validateEvent(payload, config)).toBe(false);
    });

    it('should return false when secret is not configured', () => {
      const payload = createPayload();
      const noSecretConfig: ApiEventTriggerConfig = {
        eventSource: 'github',
        eventType: 'push',
      };
      expect(adapter.validateEvent(payload, noSecretConfig)).toBe(false);
    });

    it('should return false when rawBody is missing', () => {
      const payload: EventPayload = {
        source: 'github',
        type: 'push',
        data: { headers: { 'x-hub-signature-256': 'sha256=abc' } },
        receivedAt: new Date(),
      };
      expect(adapter.validateEvent(payload, config)).toBe(false);
    });

    it('should return false when config is undefined', () => {
      const payload = createPayload();
      expect(adapter.validateEvent(payload, undefined)).toBe(false);
    });

    it('should handle case-insensitive header lookup', () => {
      const rawBody = '{"test":true}';
      const payload = createPayload({
        rawBody,
        headers: { 'X-Hub-Signature-256': createSignature(rawBody) },
      });
      expect(adapter.validateEvent(payload, config)).toBe(true);
    });
  });

  describe('matchesTrigger', () => {
    it('should match when event type equals config eventType', () => {
      const payload = createPayload({ type: 'push' });
      expect(adapter.matchesTrigger(payload, config)).toBe(true);
    });

    it('should not match when event type differs', () => {
      const payload = createPayload({ type: 'pull_request' });
      expect(adapter.matchesTrigger(payload, config)).toBe(false);
    });

    it('should match case-insensitively', () => {
      const payload = createPayload({ type: 'PUSH' });
      expect(adapter.matchesTrigger(payload, config)).toBe(true);
    });

    it('should match all events when eventType is not configured', () => {
      const payload = createPayload({ type: 'release' });
      const wildcardConfig: ApiEventTriggerConfig = {
        eventSource: 'github',
        eventType: '',
      };
      expect(adapter.matchesTrigger(payload, wildcardConfig)).toBe(true);
    });
  });
});
