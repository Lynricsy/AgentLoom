export type DeploymentMode = 'saas' | 'private'

export type PrivateDeploymentLlmProxyMode = 'direct' | 'private_cloud' | 'enterprise_proxy'

export type PrivateDeploymentCertificateSource = 'uploaded' | 'secretRef' | 'ingress-managed'

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

export interface UpdatePrivateDeploymentSmtpInput {
  host: string | null
  port: number | null
  username: string | null
  passwordSecretRef?: string | null
  fromEmail: string | null
  useTls: boolean
  password?: string | null
}

export interface UpdatePrivateDeploymentLlmProxyInput {
  mode: PrivateDeploymentLlmProxyMode
  baseUrl: string | null
  apiKeySecretRef?: string | null
  allowExternalEgress: boolean
  apiKey?: string | null
}

export interface UpdatePrivateDeploymentCertificatesInput {
  source: PrivateDeploymentCertificateSource
  tlsSecretRef: string | null
  expiresAt: string | null
  certificatePem?: string | null
  privateKeyPem?: string | null
}

export interface UpdatePrivateDeploymentLicenseInput {
  licenseKey: string | null
}

export interface UpdatePrivateDeploymentSettingsInput {
  smtp?: UpdatePrivateDeploymentSmtpInput
  llmProxy?: UpdatePrivateDeploymentLlmProxyInput
  certificates?: UpdatePrivateDeploymentCertificatesInput
  license?: UpdatePrivateDeploymentLicenseInput
}
