import { describe, it, expect, beforeEach } from 'vitest';

import type { ApiEventTriggerConfig } from '../../../database/schema/workflow-triggers.schema';
import type { EventPayload } from '../adapters/event-source.adapter';
import { GenericEventAdapter } from '../adapters/generic-event.adapter';

describe('GenericEventAdapter', () => {
  let adapter: GenericEventAdapter;

  function createPayload(type = 'custom_event'): EventPayload {
    return {
      source: 'generic',
      type,
      data: { key: 'value' },
      receivedAt: new Date(),
    };
  }

  beforeEach(() => {
    adapter = new GenericEventAdapter();
  });

  describe('name', () => {
    it('should be "generic"', () => {
      expect(adapter.name).toBe('generic');
    });
  });

  describe('validateEvent', () => {
    it('should always return true', () => {
      expect(adapter.validateEvent(createPayload())).toBe(true);
    });

    it('should return true regardless of config', () => {
      const config: ApiEventTriggerConfig = {
        eventSource: 'generic',
        eventType: 'test',
      };
      expect(adapter.validateEvent(createPayload(), config)).toBe(true);
    });

    it('should return true with empty data', () => {
      const payload: EventPayload = {
        source: 'generic',
        type: 'empty',
        data: {},
        receivedAt: new Date(),
      };
      expect(adapter.validateEvent(payload)).toBe(true);
    });
  });

  describe('matchesTrigger', () => {
    it('should match when event type equals config eventType', () => {
      const config: ApiEventTriggerConfig = {
        eventSource: 'generic',
        eventType: 'custom_event',
      };
      expect(
        adapter.matchesTrigger(createPayload('custom_event'), config),
      ).toBe(true);
    });

    it('should not match when event type differs', () => {
      const config: ApiEventTriggerConfig = {
        eventSource: 'generic',
        eventType: 'other_event',
      };
      expect(
        adapter.matchesTrigger(createPayload('custom_event'), config),
      ).toBe(false);
    });

    it('should match case-insensitively', () => {
      const config: ApiEventTriggerConfig = {
        eventSource: 'generic',
        eventType: 'CUSTOM_EVENT',
      };
      expect(
        adapter.matchesTrigger(createPayload('custom_event'), config),
      ).toBe(true);
    });

    it('should match all events when eventType is empty', () => {
      const config: ApiEventTriggerConfig = {
        eventSource: 'generic',
        eventType: '',
      };
      expect(adapter.matchesTrigger(createPayload('anything'), config)).toBe(
        true,
      );
    });

    it('should match all events when eventType is undefined', () => {
      const config = {
        eventSource: 'generic',
      } as ApiEventTriggerConfig;
      expect(adapter.matchesTrigger(createPayload('anything'), config)).toBe(
        true,
      );
    });
  });
});
