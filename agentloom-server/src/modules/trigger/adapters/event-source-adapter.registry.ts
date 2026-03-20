import { Injectable, Logger } from '@nestjs/common';

import type { EventSourceAdapter } from './event-source.adapter';
import { GenericEventAdapter } from './generic-event.adapter';
import { GithubWebhookAdapter } from './github-webhook.adapter';

@Injectable()
export class EventSourceAdapterRegistry {
  private readonly logger = new Logger(EventSourceAdapterRegistry.name);
  private readonly adapters = new Map<string, EventSourceAdapter>();

  constructor(
    private readonly githubAdapter: GithubWebhookAdapter,
    private readonly genericAdapter: GenericEventAdapter,
  ) {
    this.register(githubAdapter);
    this.register(genericAdapter);
  }

  private register(adapter: EventSourceAdapter): void {
    this.adapters.set(adapter.name, adapter);
    this.logger.log(`已注册事件源适配器: ${adapter.name}`);
  }

  getAdapter(source: string): EventSourceAdapter {
    const adapter = this.adapters.get(source);
    if (!adapter) {
      throw new Error(
        `未找到事件源适配器 '${source}'，可用适配器: ${[...this.adapters.keys()].join(', ')}`,
      );
    }
    return adapter;
  }

  getAllAdapters(): EventSourceAdapter[] {
    return [...this.adapters.values()];
  }
}
