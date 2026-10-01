import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';

export class InterventionPolicyNotFoundException extends DomainException {
  constructor(policyId: string) {
    super({
      type: problemType('intervention-policy-not-found'),
      title: 'Intervention Policy Not Found',
      status: 404,
      detail: `Intervention policy ${policyId} not found`,
    });
  }
}

export class InterventionPolicyConflictException extends DomainException {
  constructor(workflowId: string, nodeId: string | null | undefined) {
    const scope = nodeId ? `node ${nodeId}` : 'workflow level';
    super({
      type: problemType('intervention-policy-conflict'),
      title: 'Intervention Policy Conflict',
      status: 409,
      detail: `A policy already exists for ${scope} in workflow ${workflowId}`,
    });
  }
}

export class InterventionPolicyVersionConflictException extends DomainException {
  constructor(policyId: string, currentVersion: number) {
    super({
      type: problemType('intervention-policy-version-conflict'),
      title: 'Intervention Policy Version Conflict',
      status: 409,
      detail: `Version conflict for policy ${policyId}. Current version: ${currentVersion}`,
      extensions: { currentVersion },
    });
  }
}

export class InterventionRoleNotAllowedException extends DomainException {
  constructor(userRole: string, allowedRoles: string[]) {
    super({
      type: problemType('intervention-role-not-allowed'),
      title: 'Intervention Role Not Allowed',
      status: 403,
      detail: `Role '${userRole}' is not permitted to intervene. Allowed roles: ${allowedRoles.join(', ')}`,
    });
  }
}
