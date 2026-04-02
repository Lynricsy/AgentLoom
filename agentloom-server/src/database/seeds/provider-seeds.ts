import { sql as drizzleSql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { llmProviders } from '../schema/llm-providers.schema';
import type * as schema from '../schema';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * 24 个内置 LLM 提供商 seed 数据
 * lobehub icons CDN: https://icons.lobehub.com/icons/{slug}/color.svg
 */
const BUILTIN_PROVIDERS = [
  {
    slug: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com',
    apiProtocol: 'openai_responses' as const,
    sortOrder: 1,
  },
  {
    slug: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiProtocol: 'anthropic' as const,
    sortOrder: 2,
  },
  {
    slug: 'google',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    apiProtocol: 'google' as const,
    sortOrder: 3,
  },
  {
    slug: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 4,
  },
  {
    slug: 'mistral',
    name: 'Mistral AI',
    defaultBaseUrl: 'https://api.mistral.ai',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 5,
  },
  {
    slug: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 6,
  },
  {
    slug: 'xai',
    name: 'xAI (Grok)',
    defaultBaseUrl: 'https://api.x.ai',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 7,
  },
  {
    slug: 'cohere',
    name: 'Cohere',
    defaultBaseUrl: 'https://api.cohere.com',
    apiProtocol: 'cohere' as const,
    sortOrder: 8,
  },
  {
    slug: 'together',
    name: 'Together AI',
    defaultBaseUrl: 'https://api.together.xyz',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 9,
  },
  {
    slug: 'fireworks',
    name: 'Fireworks AI',
    defaultBaseUrl: 'https://api.fireworks.ai/inference',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 10,
  },
  {
    slug: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 11,
  },
  {
    slug: 'perplexity',
    name: 'Perplexity',
    defaultBaseUrl: 'https://api.perplexity.ai',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 12,
  },
  {
    slug: 'ollama',
    name: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 13,
  },
  {
    slug: 'lmstudio',
    name: 'LM Studio',
    defaultBaseUrl: 'http://localhost:1234',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 14,
  },
  {
    slug: 'siliconflow',
    name: 'SiliconFlow',
    defaultBaseUrl: 'https://api.siliconflow.cn',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 15,
  },
  {
    slug: 'zhipu',
    name: 'Zhipu AI (GLM)',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 16,
  },
  {
    slug: 'moonshot',
    name: 'Moonshot (Kimi)',
    defaultBaseUrl: 'https://api.moonshot.cn',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 17,
  },
  {
    slug: 'qwen',
    name: 'Qwen (DashScope)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 18,
  },
  {
    slug: 'doubao',
    name: 'Doubao (ByteDance)',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 19,
  },
  {
    slug: 'minimax',
    name: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.chat',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 20,
  },
  {
    slug: 'baichuan',
    name: 'Baichuan',
    defaultBaseUrl: 'https://api.baichuan-ai.com',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 21,
  },
  {
    slug: 'yi',
    name: 'Yi (01.AI)',
    defaultBaseUrl: 'https://api.lingyiwanwu.com',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 22,
  },
  {
    slug: 'stepfun',
    name: 'Stepfun',
    defaultBaseUrl: 'https://api.stepfun.com',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 23,
  },
  {
    slug: 'hunyuan',
    name: 'Hunyuan (Tencent)',
    defaultBaseUrl: 'https://api.hunyuan.cloud.tencent.com',
    apiProtocol: 'openai_chat' as const,
    sortOrder: 24,
  },
] as const;

const LOBEHUB_ICON_BASE = 'https://icons.lobehub.com/icons';
const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';

/**
 * 为系统级 sentinel 租户种子 24 个内置提供商。
 * 用户首次创建组织时，应从此 sentinel 数据复制到用户的 org/tenant 下。
 * 使用 session_replication_role = 'replica' 绕过 RLS/FK 约束。
 */
export async function seedLlmProviders(db: DB): Promise<void> {
  await db.execute(drizzleSql`SET session_replication_role = 'replica'`);

  try {
    for (const provider of BUILTIN_PROVIDERS) {
      await db
        .insert(llmProviders)
        .values({
          tenantId: SYSTEM_TENANT_ID,
          orgId: SYSTEM_ORG_ID,
          slug: provider.slug,
          name: provider.name,
          iconUrl: `${LOBEHUB_ICON_BASE}/${provider.slug}/color.svg`,
          baseUrl: provider.defaultBaseUrl,
          defaultBaseUrl: provider.defaultBaseUrl,
          isBuiltin: true,
          isEnabled: true,
          apiProtocol: provider.apiProtocol,
          sortOrder: provider.sortOrder,
        })
        .onConflictDoUpdate({
          target: [llmProviders.orgId, llmProviders.slug],
          set: {
            name: drizzleSql`EXCLUDED.name`,
            iconUrl: drizzleSql`EXCLUDED.icon_url`,
            defaultBaseUrl: drizzleSql`EXCLUDED.default_base_url`,
            apiProtocol: drizzleSql`EXCLUDED.api_protocol`,
            sortOrder: drizzleSql`EXCLUDED.sort_order`,
            updatedAt: drizzleSql`now()`,
          },
        });
    }
  } finally {
    await db.execute(drizzleSql`SET session_replication_role = 'origin'`);
  }
}

export { BUILTIN_PROVIDERS };
