import type { StrategyCategory, StrategyName } from './types'

export interface StrategyMeta {
  name: StrategyName
  displayName: string
  description: string
  icon: string
  category: StrategyCategory
}

export const STRATEGY_CATEGORY_COLORS: Record<StrategyCategory, string> = {
  simple: 'text-blue-400',
  ml: 'text-purple-400',
  rag: 'text-green-400',
  plugin: 'text-orange-400',
}

export const STRATEGY_CATEGORY_BG: Record<StrategyCategory, string> = {
  simple: 'bg-blue-500/10',
  ml: 'bg-purple-500/10',
  rag: 'bg-green-500/10',
  plugin: 'bg-orange-500/10',
}

export const STRATEGY_CATEGORY_LABELS: Record<StrategyCategory, string> = {
  simple: '基础策略',
  ml: '机器学习',
  rag: 'RAG 增强',
  plugin: '插件扩展',
}

export const STRATEGY_META: Record<StrategyName, StrategyMeta> = {
  random: {
    name: 'random',
    displayName: '随机路由',
    description: '从可用模型中随机选择一个',
    icon: 'Shuffle',
    category: 'simple',
  },
  round_robin: {
    name: 'round_robin',
    displayName: '轮询路由',
    description: '按顺序依次选择模型，均匀分配负载',
    icon: 'RefreshCw',
    category: 'simple',
  },
  rules: {
    name: 'rules',
    displayName: '规则路由',
    description: '根据自定义条件规则选择目标模型',
    icon: 'ListChecks',
    category: 'simple',
  },
  llm_as_router: {
    name: 'llm_as_router',
    displayName: 'LLM 路由',
    description: '使用 LLM 分析请求并决定最佳模型',
    icon: 'Brain',
    category: 'simple',
  },
  fallback_chain: {
    name: 'fallback_chain',
    displayName: '回退链',
    description: '按优先级依次尝试，失败时切换到下一个模型',
    icon: 'ArrowDownUp',
    category: 'simple',
  },
  knn: {
    name: 'knn',
    displayName: 'KNN 路由',
    description: '基于 K 近邻算法匹配历史相似请求选择模型',
    icon: 'ScatterChart',
    category: 'ml',
  },
  mlp: {
    name: 'mlp',
    displayName: 'MLP 路由',
    description: '使用多层感知器预测最佳模型',
    icon: 'Network',
    category: 'ml',
  },
  elo: {
    name: 'elo',
    displayName: 'Elo 评分',
    description: '基于 Elo 评分系统动态评估模型表现',
    icon: 'Trophy',
    category: 'ml',
  },
  memory_bank: {
    name: 'memory_bank',
    displayName: '记忆库路由',
    description: '结合向量检索的长期记忆选择最优模型',
    icon: 'Database',
    category: 'rag',
  },
  wasm_plugin: {
    name: 'wasm_plugin',
    displayName: 'WASM 插件',
    description: '通过自定义 WASM 插件实现路由逻辑',
    icon: 'Puzzle',
    category: 'plugin',
  },
}

export const STRATEGY_NAMES_BY_CATEGORY: Record<StrategyCategory, StrategyName[]> = {
  simple: ['random', 'round_robin', 'rules', 'llm_as_router', 'fallback_chain'],
  ml: ['knn', 'mlp', 'elo'],
  rag: ['memory_bank'],
  plugin: ['wasm_plugin'],
}

/**
 * 按任意策略名查 UI 元数据。
 *
 * server 的策略名是自由字符串（插件可注册新策略），因此查表天然是部分函数：
 * 未知策略返回 undefined，调用方回落到显示原始名。
 */
export function getStrategyMeta(name: string): StrategyMeta | undefined {
  return Object.hasOwn(STRATEGY_META, name)
    ? STRATEGY_META[name as StrategyName]
    : undefined
}
