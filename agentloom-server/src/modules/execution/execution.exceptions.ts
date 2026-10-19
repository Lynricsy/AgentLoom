import { HttpStatus } from '@nestjs/common';
import { isPortDataTypeCompatible } from '@agentloom/contracts';
import { DomainException } from '../../common/exceptions/domain.exception';
import type { FieldError } from '../../common/types/problem-details.type';

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

export class DeadLetterJobNotFoundException extends DomainException {
  constructor(jobId: string) {
    super({
      type: 'https://agentloom.dev/errors/dead-letter-job-not-found',
      title: '死信任务不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `死信任务 ${jobId} 不存在，或不属于当前租户`,
    });
  }
}

/** action 写明被拒绝的操作，让 detail 与调用场景一致（启动执行、优化分析等）。 */
export class WorkflowNotPublishedException extends DomainException {
  constructor(workflowId: string, action = '启动执行') {
    super({
      type: 'https://agentloom.dev/errors/workflow-not-published',
      title: '工作流未发布',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 尚未发布，无法${action}`,
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

export class WorkflowLaunchSchemaVersionMismatchException extends DomainException {
  constructor(currentSchemaVersion: number, providedSchemaVersion?: number) {
    super({
      type: 'https://agentloom.dev/errors/workflow-launch-schema-version-mismatch',
      title: '启动参数 schemaVersion 不匹配',
      status: HttpStatus.CONFLICT,
      // 运行按工作流当前保存的输入参数配置校验（PATCH 保存即生效，不随发布版本走），不是「已发布」契约。
      detail: `启动请求使用的 schemaVersion=${providedSchemaVersion ?? 'undefined'} 与工作流当前输入契约版本 ${currentSchemaVersion} 不一致，请先 GET /workflow-definitions/:id/input-schema 取最新 version`,
      errors: [
        {
          field: 'schemaVersion',
          message: `当前可用版本为 ${currentSchemaVersion}`,
        },
      ],
      extensions: {
        currentSchemaVersion,
        providedSchemaVersion: providedSchemaVersion ?? null,
      },
    });
  }
}

export class WorkflowLaunchInputValidationException extends DomainException {
  constructor(errors: FieldError[]) {
    super({
      type: 'https://agentloom.dev/errors/workflow-launch-input-invalid',
      title: '启动参数校验失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: '工作流启动参数未通过输入契约校验，请修正后重试',
      errors,
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

export class InterventionNotAllowedException extends DomainException {
  constructor(stepId: string, currentStatus: string) {
    super({
      type: 'https://agentloom.dev/errors/intervention-not-allowed',
      title: '步骤不允许干预',
      status: HttpStatus.CONFLICT,
      detail: `步骤 ${stepId} 当前状态为 ${currentStatus}，无法进行人工干预`,
    });
  }
}

export class InterventionPermissionDeniedException extends Error {
  constructor() {
    super('Your role does not have permission to intervene on this node');
    this.name = 'InterventionPermissionDeniedException';
  }
}

export class ExecutionNotResumableException extends DomainException {
  constructor(executionId: string, currentStatus: string, reason?: string) {
    super({
      type: 'https://agentloom.dev/errors/execution-not-resumable',
      title: '执行不可恢复',
      status: HttpStatus.CONFLICT,
      detail:
        reason ??
        `执行 ${executionId} 当前状态为 ${currentStatus}，无法恢复。仅 failed 状态的执行可以恢复，paused 状态请先进行人工干预`,
    });
  }
}

/** resume 的 fromNodeId 不在执行快照的节点中。 */
export class ExecutionResumeNodeNotFoundException extends DomainException {
  constructor(executionId: string, nodeId: string) {
    super({
      type: 'https://agentloom.dev/errors/execution-resume-node-not-found',
      title: '恢复起点节点不存在',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `执行 ${executionId} 的工作流快照中不存在节点 ${nodeId}`,
    });
  }
}

/**
 * resume 的 fromNodeId 是循环/迭代容器内部的节点。恢复调度只调度顶层节点，内部节点随容器
 * 整体重跑，因此必须从所属的顶层容器节点恢复。
 */
export class ExecutionResumeNodeInsideContainerException extends DomainException {
  constructor(executionId: string, nodeId: string, containerNodeId: string) {
    super({
      type: 'https://agentloom.dev/errors/execution-resume-node-inside-container',
      title: '恢复起点位于容器内部',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `执行 ${executionId} 中的节点 ${nodeId} 位于容器 ${containerNodeId} 内部，不能单独恢复；请从容器节点 ${containerNodeId} 恢复，容器会从第一项/第一轮整体重跑`,
      extensions: { nodeId, containerNodeId },
    });
  }
}

/** 步骤不存在或不属于路径中的执行（不区分两者，避免泄露其他执行的步骤 id）。 */
export class ExecutionStepNotFoundException extends DomainException {
  constructor(executionId: string, stepId: string) {
    super({
      type: 'https://agentloom.dev/errors/execution-step-not-found',
      title: '执行步骤不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `执行 ${executionId} 中不存在步骤 ${stepId}`,
    });
  }
}

export class InvalidToolCallTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super({
      type: 'https://agentloom.dev/errors/invalid-tool-call-transition',
      title: '工具调用状态转换非法',
      status: HttpStatus.CONFLICT,
      detail: `工具调用状态不允许从 ${from} 转换到 ${to}`,
    });
  }
}

export interface TypeMismatchDetail {
  readonly sourcePortId: string;
  readonly targetPortId: string;
  readonly sourceType: string;
  readonly targetType: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly edgeId?: string;
}

export class NodeTypeMismatchException extends DomainException {
  readonly typeMismatch: TypeMismatchDetail;

  /**
   * @param valueReason 端口类型可连、但运行期校验型变换（如 json → array 的 ensure_array）
   *   判定实际值不满足时的原因；缺省表示端口类型本身不兼容。
   */
  constructor(detail: TypeMismatchDetail, valueReason?: string) {
    const edge = `节点 ${detail.sourceNodeId} 的输出端口 "${detail.sourcePortId}" (${detail.sourceType}) 与节点 ${detail.targetNodeId} 的输入端口 "${detail.targetPortId}" (${detail.targetType})`;
    super({
      type: 'https://agentloom.dev/errors/node-type-mismatch',
      title: '端口类型不匹配',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: valueReason
        ? `${edge} 之间的值不满足目标类型：${valueReason}`
        : `${edge} 类型不兼容`,
    });
    this.typeMismatch = detail;
  }
}

/** 执行前展平可复用块失败：块定义缺失，或外部连线引用的块端口无法映射到块内节点。 */
export class ReusableBlockExpansionException extends DomainException {
  constructor(blockNodeId: string, reason: string) {
    super({
      type: 'https://agentloom.dev/errors/reusable-block-expansion-failed',
      title: '可复用块无法展开',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `可复用块节点 ${blockNodeId}：${reason}`,
    });
  }
}

/**
 * 端口类型兼容性检查。
 *
 * 委托 contracts 的 canonical 变换表（其权威来源是 type-engine 的 Rust checker），
 * 不再自带一份规则。此前 server 额外放行 `targetType === 'json'` 通配，
 * 使执行期比画布更宽松——但画布上根本造不出这种边，通配只会掩盖真实的类型不匹配。
 */
export function isPortTypeCompatible(
  sourceType: string,
  targetType: string,
): boolean {
  return isPortDataTypeCompatible(sourceType, targetType);
}
