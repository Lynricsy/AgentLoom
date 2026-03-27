import { describe, it, expect, beforeEach } from 'vitest';

import { EventSourceAdapterRegistry } from '../adapters/event-source-adapter.registry';
import { GenericEventAdapter } from '../adapters/generic-event.adapter';
import { GithubWebhookAdapter } from '../adapters/github-webhook.adapter';

describe('EventSourceAdapterRegistry', () => {
  let registry: EventSourceAdapterRegistry;
  let githubAdapter: GithubWebhookAdapter;
  let genericAdapter: GenericEventAdapter;

  beforeEach(() => {
    githubAdapter = new GithubWebhookAdapter();
    genericAdapter = new GenericEventAdapter();
    registry = new EventSourceAdapterRegistry(githubAdapter, genericAdapter);
  });

  describe('getAdapter', () => {
    it('should return GithubWebhookAdapter for "github"', () => {
      const adapter = registry.getAdapter('github');
      expect(adapter).toBe(githubAdapter);
      expect(adapter.name).toBe('github');
    });

    it('should return GenericEventAdapter for "generic"', () => {
      const adapter = registry.getAdapter('generic');
      expect(adapter).toBe(genericAdapter);
      expect(adapter.name).toBe('generic');
    });

    it('should throw for unknown adapter name', () => {
      expect(() => registry.getAdapter('unknown')).toThrow(
        "未找到事件源适配器 'unknown'",
      );
    });

    it('should include available adapter names in error message', () => {
      expect(() => registry.getAdapter('slack')).toThrow(/github, generic/);
    });
  });

  describe('getAllAdapters', () => {
    it('should return all registered adapters', () => {
      const adapters = registry.getAllAdapters();
      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(githubAdapter);
      expect(adapters).toContain(genericAdapter);
    });

    it('should return a new array on each call', () => {
      const first = registry.getAllAdapters();
      const second = registry.getAllAdapters();
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });
});
