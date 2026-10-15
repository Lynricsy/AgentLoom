import type {
  DecisionRecordListResponseDto,
  DecisionRecordListResponseDtoDataInner,
  DecisionRecordListResponseDtoDataInnerSubjectTypeEnum,
} from '@agentloom/api-client'

/** 一条决策记录：规则主结果（mode=primary）或 Jev 影子结果（mode=shadow） */
export type DecisionRecord = DecisionRecordListResponseDtoDataInner

export type DecisionRecordList = DecisionRecordListResponseDto

export type DecisionSubjectType = DecisionRecordListResponseDtoDataInnerSubjectTypeEnum

export interface DecisionRecordQuery {
  subjectType: DecisionSubjectType
  subjectId: string
}
