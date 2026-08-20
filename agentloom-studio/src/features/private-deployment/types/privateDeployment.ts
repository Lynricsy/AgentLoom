import type {
  UpdatePrivateDeploymentSettingsRequestDto,
  UpdatePrivateDeploymentSettingsRequestDtoCertificates,
  UpdatePrivateDeploymentSettingsRequestDtoCertificatesSourceEnum,
  UpdatePrivateDeploymentSettingsRequestDtoLicense,
  UpdatePrivateDeploymentSettingsRequestDtoLlmProxy,
  UpdatePrivateDeploymentSettingsRequestDtoLlmProxyModeEnum,
  UpdatePrivateDeploymentSettingsRequestDtoSmtp,
} from '@agentloom/api-client'

export type DeploymentMode = 'saas' | 'private'

export type PrivateDeploymentLlmProxyMode =
  UpdatePrivateDeploymentSettingsRequestDtoLlmProxyModeEnum

export type PrivateDeploymentCertificateSource =
  UpdatePrivateDeploymentSettingsRequestDtoCertificatesSourceEnum

export type PrivateDeploymentLicenseStatus = 'missing' | 'valid' | 'invalid' | 'expired'

export interface PrivateDeploymentSmtpSettings {
  host: string | null
  port: number | null
  username: string | null
  passwordSecretRef: string | null
  fromEmail: string | null
  useTls: boolean
}

export interface PrivateDeploymentLlmProxySettings {
  mode: PrivateDeploymentLlmProxyMode
  baseUrl: string | null
  apiKeySecretRef: string | null
  allowExternalEgress: boolean
}

export interface PrivateDeploymentCertificatesSettings {
  source: PrivateDeploymentCertificateSource
  tlsSecretRef: string | null
  expiresAt: string | null
}

export interface PrivateDeploymentLicenseSettings {
  status: PrivateDeploymentLicenseStatus
  fingerprint: string | null
  expiresAt: string | null
  lastVerifiedAt: string | null
}

export interface PrivateDeploymentSettings {
  organizationId: string
  tenantId: string | null
  deploymentMode: DeploymentMode
  version: number
  smtp: PrivateDeploymentSmtpSettings
  llmProxy: PrivateDeploymentLlmProxySettings
  certificates: PrivateDeploymentCertificatesSettings
  license: PrivateDeploymentLicenseSettings
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

/** PUT /private-deployment/settings 请求体各段（生成模型） */
export type UpdatePrivateDeploymentSmtpInput =
  UpdatePrivateDeploymentSettingsRequestDtoSmtp

export type UpdatePrivateDeploymentLlmProxyInput =
  UpdatePrivateDeploymentSettingsRequestDtoLlmProxy

export type UpdatePrivateDeploymentCertificatesInput =
  UpdatePrivateDeploymentSettingsRequestDtoCertificates

export type UpdatePrivateDeploymentLicenseInput =
  UpdatePrivateDeploymentSettingsRequestDtoLicense

export type UpdatePrivateDeploymentSettingsInput =
  UpdatePrivateDeploymentSettingsRequestDto
