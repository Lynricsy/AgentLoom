import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

interface WorkflowPublishAutonomyViolation {
  nodeId: string;
  nodeName: string;
  rawMode: string | null;
  canonicalMode: string;
  replacementMode: string;
  message: string;
}

interface WorkflowAgentBindingViolation {
  nodeId: string;
  nodeLabel: string;
}

export class WorkflowArchivedException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-archived',
      title: '工作流已归档',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 已归档，无法执行此操作`,
    });
  }
}

export class WorkflowPublishValidationException extends DomainException {
  constructor(reasons: string | string[]) {
    const validationReasons = Array.isArray(reasons) ? reasons : [reasons];

    super({
      type: 'https://agentloom.dev/errors/workflow-publish-validation',
      title: '工作流发布验证失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: validationReasons[0] ?? '工作流发布校验失败',
      errors: validationReasons.map((message) => ({
        field: 'workflow',
        message,
      })),
    });
  }
}

export class WorkflowPublishAgentBindingException extends DomainException {
  constructor(violations: WorkflowAgentBindingViolation[]) {
    const nodeDetails = violations
      .map(
        ({ nodeId, nodeLabel }) =>
          `Agent 节点「${nodeLabel}」（${nodeId}）未绑定已发布的 Agent Definition`,
      )
      .join('；');
    const remediation =
      '请在画布上为该节点选择一个已发布的 Agent Definition 后再发布';

    super({
      type: 'https://agentloom.dev/errors/workflow-publish-agent-binding',
      title: '工作流 Agent 绑定校验失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `${nodeDetails}。${remediation}`,
      errors: violations.map(({ nodeId, nodeLabel }) => ({
        field: `nodes.${nodeId}.agentDefinitionId`,
        message: `Agent 节点「${nodeLabel}」（${nodeId}）未绑定已发布的 Agent Definition。${remediation}`,
      })),
      extensions: { violations },
    });
  }
}

export class WorkflowPublishAutonomyCapException extends DomainException {
  constructor(
    autonomyCap: string,
    violations: WorkflowPublishAutonomyViolation[],
  ) {
    super({
      type: 'https://agentloom.dev/errors/workflow-publish-autonomy-cap',
      title: '工作流自治上限校验失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: violations[0]?.message ?? '工作流存在超出组织自治上限的节点配置',
      errors: violations.map((violation) => ({
        field: `nodes.${violation.nodeId}.autonomyMode`,
        message: `节点 ${violation.nodeName}（${violation.nodeId}）的自治模式 ${violation.rawMode ?? '未设置'} 超出组织上限 ${autonomyCap}，应降级为 ${violation.replacementMode}`,
      })),
      extensions: {
        autonomyCap,
        violations,
      },
    });
  }
}

export class InvalidStatusTransitionException extends DomainException {
  constructor(currentStatus: string, targetStatus: string) {
    super({
      type: 'https://agentloom.dev/errors/invalid-status-transition',
      title: '无效的状态转换',
      status: HttpStatus.CONFLICT,
      detail: `无法从 ${currentStatus} 转换为 ${targetStatus}`,
    });
  }
}

export class WorkflowNotFoundException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-not-found',
      title: '工作流不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `工作流 ${workflowId} 不存在`,
    });
  }
}

export class WorkflowVersionNotFoundException extends DomainException {
  constructor(versionId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-version-not-found',
      title: '工作流版本不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `工作流版本 ${versionId} 不存在`,
    });
  }
}

export class WorkflowVersionConflictException extends DomainException {
  constructor(workflowId: string, currentVersion: number) {
    super({
      type: 'https://agentloom.dev/errors/version-conflict',
      title: '版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 已被其他用户修改，请刷新后重试`,
      extensions: {
        currentVersion,
      },
      errors: [
        {
          field: 'version',
          message: `当前版本为 ${currentVersion}`,
        },
      ],
    });
  }
}
