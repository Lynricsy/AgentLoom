import type { AutonomyMode } from '@/features/canvas/autonomy.types'

export interface OrganizationAutonomyViolationSummary {
  workflowCount: number
  nodeCount: number
}

export interface OrganizationAutonomyPolicy {
  organizationId: string
  autonomyCap: AutonomyMode
  version: number
  violationSummary: OrganizationAutonomyViolationSummary
  createdAt?: string | null
  updatedAt?: string | null
  updatedBy?: string | null
}

export interface OrganizationAutonomyViolationDetail {
  workflowId: string
  workflowName: string
  nodeId: string
  nodeName: string
  rawMode: string
  canonicalMode: AutonomyMode
  replacementMode: AutonomyMode
  source: string
  reasonCode: string
  message: string
}

export interface UpdateOrganizationAutonomyPolicyInput {
  autonomyCap: AutonomyMode
}

export interface OrganizationAutonomyDowngradePreview {
  organizationId: string
  autonomyCap: AutonomyMode
  violationSummary: OrganizationAutonomyViolationSummary
  violations: OrganizationAutonomyViolationDetail[]
}

export interface OrganizationAutonomyDowngradeConfirmResult {
  organizationId: string
  autonomyCap: AutonomyMode
  downgradedSummary: OrganizationAutonomyViolationSummary
  downgradedViolations: OrganizationAutonomyViolationDetail[]
  policy: OrganizationAutonomyPolicy
}
