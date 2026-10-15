import { apiClient } from '@/shared/api/client'
import type { DecisionRecordList, DecisionRecordQuery } from '../types'

/** 单个主体的记录只有主结果与影子结果各一条，取一页足够 */
const SUBJECT_RECORD_PAGE_SIZE = 10

/** GET /decision-records —— 按主体查询，服务端按 createdAt 倒序 */
export async function fetchDecisionRecords(
  query: DecisionRecordQuery,
): Promise<DecisionRecordList> {
  return apiClient
    .get('decision-records', {
      searchParams: {
        subjectType: query.subjectType,
        subjectId: query.subjectId,
        pageSize: SUBJECT_RECORD_PAGE_SIZE,
      },
    })
    .json<DecisionRecordList>()
}
