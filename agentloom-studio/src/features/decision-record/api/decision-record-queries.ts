import { useQuery } from '@tanstack/react-query'
import { fetchDecisionRecords } from './decision-record-api'
import { decisionRecordKeys } from './decision-record-keys'
import type { DecisionRecordQuery } from '../types'

export function useDecisionRecords(query: DecisionRecordQuery) {
  return useQuery({
    queryKey: decisionRecordKeys.list(query),
    queryFn: () => fetchDecisionRecords(query),
    staleTime: 15_000,
  })
}
