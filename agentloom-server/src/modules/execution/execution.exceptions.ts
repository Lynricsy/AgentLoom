import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class ExecutionNotFoundException extends DomainException {
  constructor(executionId: string) {
    super({
      type: 'https://agentloom.dev/errors/execution-not-found',
      title: '执行记录不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `执行记录 ${executionId} 不存在`,
    });
  }
}

export class WorkflowNotPublishedException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-not-published',
      title: '工作流未发布',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 尚未发布，无法启动执行`,
    });
  }
}

export class ExecutionNotCancellableException extends DomainException {
  constructor(executionId: string, currentStatus: string) {
    super({
      type: 'https://agentloom.dev/errors/execution-not-cancellable',
      title: '执行不可取消',
      status: HttpStatus.CONFLICT,
      detail: `执行 ${executionId} 当前状态为 ${currentStatus}，无法取消`,
    });
  }
}
