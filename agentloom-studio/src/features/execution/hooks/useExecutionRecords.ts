import { useQuery } from '@tanstack/react-query'
import { executionKeys } from '../api/executionKeys'
import {
  EXECUTION_RECORD_PAGE_SIZE,
  fetchExecutionRecords,
  type ExecutionRecordsResult,
} from '../api/executionRecordApi'

export function useExecutionRecords(
  executionId: string,
  { limit = EXECUTION_RECORD_PAGE_SIZE, offset = 0 } = {},
) {
  return useQuery<ExecutionRecordsResult, Error>({
    queryKey: executionKeys.records({ executionId, limit, offset }),
    queryFn: () => fetchExecutionRecords({ executionId, limit, offset }),
    enabled: Boolean(executionId),
  })
}
