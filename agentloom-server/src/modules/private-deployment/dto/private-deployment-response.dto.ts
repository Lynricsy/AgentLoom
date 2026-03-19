export type DeploymentMode = 'saas' | 'private';
export type PrivateDeploymentLlmProxyMode =
  | 'direct'
  | 'private_cloud'
  | 'enterprise_proxy';
export type PrivateDeploymentCertificateSource =
  | 'uploaded'
  | 'secretRef'
  | 'ingress-managed';
export type PrivateDeploymentLicenseStatus =
  | 'missing'
  | 'valid'
  | 'invalid'
  | 'expired';

export interface PrivateDeploymentSmtpSettingsDto {
  host: string | null;
  port: number | null;
  username: string | null;
  passwordSecretRef: string | null;
  fromEmail: string | null;
  useTls: boolean;
}

export interface PrivateDeploymentLlmProxySettingsDto {
  mode: PrivateDeploymentLlmProxyMode;
  baseUrl: string | null;
  apiKeySecretRef: string | null;
  allowExternalEgress: boolean;
}

export interface PrivateDeploymentCertificatesSettingsDto {
  source: PrivateDeploymentCertificateSource;
  tlsSecretRef: string | null;
  expiresAt: string | null;
}

export interface PrivateDeploymentLicenseDto {
  status: PrivateDeploymentLicenseStatus;
  fingerprint: string | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
}

export interface PrivateDeploymentResponseDto {
  organizationId: string;
  tenantId: string;
  deploymentMode: DeploymentMode;
  smtp: PrivateDeploymentSmtpSettingsDto;
  llmProxy: PrivateDeploymentLlmProxySettingsDto;
  certificates: PrivateDeploymentCertificatesSettingsDto;
  license: PrivateDeploymentLicenseDto;
  version: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}
