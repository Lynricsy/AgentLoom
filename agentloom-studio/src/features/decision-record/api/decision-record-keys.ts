import type { DecisionRecordQuery } from '../types'

export const decisionRecordKeys = {
  all: ['decision-records'] as const,
  lists: () => [...decisionRecordKeys.all, 'list'] as const,
  list: (query: DecisionRecordQuery) =>
    [...decisionRecordKeys.lists(), query] as const,
}
