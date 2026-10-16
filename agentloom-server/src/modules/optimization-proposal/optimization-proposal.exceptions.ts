import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';

export type OptimizationProposalStaleReason =
  | 'base_version_not_published'
  | 'candidate_version_not_published'
  | 'node_missing';

const STALE_REASON_DETAIL: Record<OptimizationProposalStaleReason, string> = {
  base_version_not_published: '工作流的发布版本已不是提案生成时的基线版本',
  candidate_version_not_published: '工作流的发布版本已不是该提案发布的版本',
  node_missing: '基线版本中已不存在提案针对的节点',
};

export class OptimizationProposalNotFoundException extends DomainException {
  constructor(proposalId: string) {
    super({
      type: problemType('optimization-proposal-not-found'),
      title: '优化提案不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `优化提案 ${proposalId} 不存在`,
    });
  }
}

export class OptimizationProposalStatusConflictException extends DomainException {
  constructor(proposalId: string, status: string, allowed: string[]) {
    super({
      type: problemType('optimization-proposal-status-conflict'),
      title: '优化提案状态不允许该操作',
      status: HttpStatus.CONFLICT,
      detail: `优化提案 ${proposalId} 当前状态为 ${status}，该操作仅允许 ${allowed.join(' / ')}`,
    });
  }
}

export class OptimizationProposalStaleException extends DomainException {
  constructor(proposalId: string, reason: OptimizationProposalStaleReason) {
    super({
      type: problemType('optimization-proposal-stale'),
      title: '优化提案已失效',
      status: HttpStatus.CONFLICT,
      detail: `优化提案 ${proposalId}：${STALE_REASON_DETAIL[reason]}`,
    });
  }
}

export class OptimizationProposalNotImprovedException extends DomainException {
  constructor(proposalId: string, verdict: string | null) {
    super({
      type: problemType('optimization-proposal-not-improved'),
      title: '评测结论不是优于基线',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `优化提案 ${proposalId} 的评测结论为 ${verdict ?? '未完成'}，只有优于基线的提案可以发布`,
    });
  }
}

export class OptimizationProposalInvalidPatchException extends DomainException {
  constructor(proposalId: string, detail: string) {
    super({
      type: problemType('optimization-proposal-invalid-patch'),
      title: '优化提案补丁无效',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `优化提案 ${proposalId}：${detail}`,
    });
  }
}

export class OptimizationEvaluationNoCasesException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: problemType('optimization-evaluation-no-cases'),
      title: '没有可回放的评测用例',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `工作流 ${workflowId} 没有已结束的真实执行可作为评测用例`,
    });
  }
}

export class OptimizationWorkflowNodeNotSupportedException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: problemType('optimization-workflow-not-analyzable'),
      title: '工作流不可分析',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `工作流 ${workflowId} 的发布版本中没有团队或智能路由节点`,
    });
  }
}
