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

export class WorkflowArchivedException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-archived',
      title: '工作流已归档',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 已归档，无法启动执行`,
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

export class CyclicGraphException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/cyclic-graph',
      title: '工作流图存在环路',
      status: HttpStatus.BAD_REQUEST,
      detail: '工作流 DAG 图包含环路，无法执行拓扑排序',
    });
  }
}

export class InvalidStepTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super({
      type: 'https://agentloom.dev/errors/invalid-step-transition',
      title: '步骤状态转换非法',
      status: HttpStatus.CONFLICT,
      detail: `步骤状态不允许从 ${from} 转换到 ${to}`,
    });
  }
}

export class AgentExecutionException extends DomainException {
  constructor(reason: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-execution-failed',
      title: 'Agent 执行失败',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: `Agent 执行失败：${reason}`,
    });
  }
}

export class NodeInputResolutionException extends DomainException {
  constructor(nodeId: string) {
    super({
      type: 'https://agentloom.dev/errors/node-input-resolution-failed',
      title: '节点输入解析失败',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: `无法解析节点 ${nodeId} 的输入数据`,
    });
  }
}
