import type { RoutingDecisionQuery } from '../types'

export const routingDecisionKeys = {
  all: ['routing-decisions'] as const,
  health: () => [...routingDecisionKeys.all, 'provider-health'] as const,
  lists: () => [...routingDecisionKeys.all, 'list'] as const,
  list: (query: RoutingDecisionQuery) =>
    [...routingDecisionKeys.lists(), query] as const,
}
