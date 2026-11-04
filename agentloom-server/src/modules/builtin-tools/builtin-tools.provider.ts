import { Injectable } from '@nestjs/common';
import { jsonSchema, tool, type ToolSet } from 'ai';

import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type { AgentBuiltinToolPolicy } from '../agent-definition/agent-runtime-config.interface';
import {
  formatWebSearchFailures,
  WebSearchUnavailableException,
} from './web-search/web-search.exceptions';
import { WebSearchService } from './web-search/web-search.service';
import {
  WEB_SEARCH_RECENCIES,
  type WebSearchOutcome,
  type WebSearchRecency,
} from './web-search/web-search.types';

export const WEB_SEARCH_TOOL_NAME = 'web_search';

const WEB_SEARCH_QUERY_MAX_CHARS = 500;
const WEB_SEARCH_DEFAULT_LIMIT = 8;
const WEB_SEARCH_MAX_LIMIT = 20;

const WEB_SEARCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search query.',
      minLength: 1,
      maxLength: WEB_SEARCH_QUERY_MAX_CHARS,
    },
    recency: {
      type: 'string',
      enum: [...WEB_SEARCH_RECENCIES],
      description: 'Only return pages from the last day/week/month/year.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: WEB_SEARCH_MAX_LIMIT,
      default: WEB_SEARCH_DEFAULT_LIMIT,
      description: `Maximum number of sources (1-${WEB_SEARCH_MAX_LIMIT}, default ${WEB_SEARCH_DEFAULT_LIMIT}).`,
    },
  },
  required: ['query'],
  additionalProperties: false,
} satisfies Parameters<typeof jsonSchema>[0];

interface WebSearchToolInput {
  query?: unknown;
  recency?: unknown;
  limit?: unknown;
}

export interface BuiltinToolSetParams {
  sessionId: string;
  tenantId: string;
  /** 会话 runtimeConfig.builtinToolPolicy；缺省全部启用 */
  policy?: AgentBuiltinToolPolicy;
  /** sandbox 会话结果经远程工具回调内联回 guest（inline），no_sandbox 会话落对象存储（storage） */
  delivery: 'inline' | 'storage';
}

export interface BuiltinToolsRegistration extends BuiltinToolSetParams {
  runtime: IAgentRuntime;
}

/**
 * 服务端内置工具（两种运行态共用一份实现）：以 SessionToolProvider 注册到会话；
 * sandbox 会话经既有远程工具回调抵达 guest。
 */
@Injectable()
export class BuiltinToolsProvider {
  constructor(private readonly webSearchService: WebSearchService) {}

  async register(params: BuiltinToolsRegistration): Promise<void> {
    const { runtime, ...toolSetParams } = params;
    if (!runtime.registerSessionToolProvider) {
      return;
    }
    const tools = await this.buildToolSet(toolSetParams);
    if (Object.keys(tools).length === 0) {
      return;
    }
    runtime.registerSessionToolProvider(params.sessionId, () => tools);
  }

  buildToolSet(params: BuiltinToolSetParams): Promise<ToolSet> {
    const tools: ToolSet = {};
    if (params.policy?.webSearchEnabled !== false) {
      tools[WEB_SEARCH_TOOL_NAME] = this.createWebSearchTool();
    }
    return Promise.resolve(tools);
  }

  private createWebSearchTool() {
    return tool({
      description:
        "Search the web and return ranked sources with snippets; use it for current facts, docs and URLs you don't know.",
      inputSchema: jsonSchema(WEB_SEARCH_INPUT_SCHEMA),
      execute: (input, options) =>
        this.executeWebSearch(input as WebSearchToolInput, options.abortSignal),
    });
  }

  private async executeWebSearch(
    input: WebSearchToolInput,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) {
      return 'web search failed: query is required';
    }
    if (query.length > WEB_SEARCH_QUERY_MAX_CHARS) {
      return `web search failed: query exceeds ${WEB_SEARCH_QUERY_MAX_CHARS} characters`;
    }
    const recency = WEB_SEARCH_RECENCIES.includes(
      input.recency as WebSearchRecency,
    )
      ? (input.recency as WebSearchRecency)
      : undefined;
    const limit =
      typeof input.limit === 'number' && Number.isFinite(input.limit)
        ? Math.min(WEB_SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(input.limit)))
        : WEB_SEARCH_DEFAULT_LIMIT;

    try {
      const outcome = await this.webSearchService.search({
        query,
        recency,
        limit,
        signal,
      });
      return formatWebSearchOutcome(outcome);
    } catch (error) {
      if (error instanceof WebSearchUnavailableException) {
        return `web search failed: ${
          error.failures.length > 0
            ? formatWebSearchFailures(error.failures)
            : error.detail
        }`;
      }
      throw error;
    }
  }
}

export function formatWebSearchOutcome(outcome: WebSearchOutcome): string {
  const lines = [`Provider: ${outcome.provider}`];
  if (outcome.failures.length > 0) {
    lines.push(
      `Note: answered by ${outcome.provider} after ${outcome.failures
        .map((failure) => failure.id)
        .join(', ')} failed (${formatWebSearchFailures(outcome.failures)})`,
    );
  }
  if (outcome.answer) {
    lines.push('', '## Answer', outcome.answer.trim());
  }
  lines.push('', `## Sources (${outcome.results.length})`);
  outcome.results.forEach((result, index) => {
    lines.push(`[${index + 1}] ${result.title}`, `    ${result.url}`);
    if (result.snippet) {
      lines.push(`    ${result.snippet}`);
    }
  });
  return lines.join('\n');
}
