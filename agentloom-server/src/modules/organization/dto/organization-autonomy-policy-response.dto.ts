import type { AutonomyMode } from '../../agent/dto/autonomy.dto';
import type {
  AutonomyModeSource,
  AutonomyViolationReasonCode,
} from '../../agent/autonomy-mode-compat';

export interface OrganizationAutonomyViolationSummaryDto {
  workflowCount: number;
  nodeCount: number;
}

export interface OrganizationAutonomyPolicyResponseDto {
  organizationId: string;
  autonomyCap: AutonomyMode;
  version: number;
  violationSummary: OrganizationAutonomyViolationSummaryDto;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationAutonomyViolationDetailDto {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeName: string;
  rawMode: string | null;
  canonicalMode: AutonomyMode;
  replacementMode: AutonomyMode;
  source: AutonomyModeSource;
  reasonCode: AutonomyViolationReasonCode;
  message: string;
}

export interface OrganizationAutonomyDowngradePreviewResponseDto {
  organizationId: string;
  autonomyCap: AutonomyMode;
  violationSummary: OrganizationAutonomyViolationSummaryDto;
  violations: OrganizationAutonomyViolationDetailDto[];
}

export interface OrganizationAutonomyDowngradeConfirmResponseDto {
  organizationId: string;
  autonomyCap: AutonomyMode;
  downgradedSummary: OrganizationAutonomyViolationSummaryDto;
  downgradedViolations: OrganizationAutonomyViolationDetailDto[];
  policy: OrganizationAutonomyPolicyResponseDto;
}
