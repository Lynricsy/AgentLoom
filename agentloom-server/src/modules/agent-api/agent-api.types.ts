/** Agent 专用 API Key 明文前缀；与平台 Token 的 `al_` 区分，global AuthGuard 不识别 */
export const AGENT_API_KEY_PREFIX = 'alak_';

/** AgentApiKeyGuard 校验通过后挂到 `request.agentApiKey` 的调用方上下文 */
export interface AgentApiKeyContext {
  keyId: string;
  tenantId: string;
  agentDefinitionId: string;
  keyPrefix: string;
  maxConcurrentRuns: number;
  /** 为 null 时节流使用租户 apiRateLimitPerMinute */
  rateLimitPerMinute: number | null;
}
