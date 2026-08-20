import type {
  TenantKeyDetailResponseDto,
  TenantKeyResponseDto,
  TenantKeyResponseDtoStatusEnum,
  UploadPublicKeyDto,
} from '@agentloom/api-client'

export const ENCRYPTION_KEY_STATUSES = [
  'active',
  'rotating',
  'revoked',
] as const

export type EncryptionKeyStatus = TenantKeyResponseDtoStatusEnum

export type TenantKeyResponse = TenantKeyResponseDto

export type TenantKeyDetailResponse = TenantKeyDetailResponseDto

/** POST /tenant-keys 与 /tenant-keys/:id/rotate 请求体（生成模型） */
export type UploadPublicKeyPayload = UploadPublicKeyDto

export interface EncryptedPayload {
  ciphertext: string
  encryptedSessionKey: string
  iv: string
  authTag: string
  aad: string
  keyFingerprint: string
  algorithm: string
}

export interface GeneratedKeyPair {
  publicKeyPem: string
  privateKeyPem: string
  privateKeyPkcs8: ArrayBuffer
  fingerprint: string
}

export interface EncryptionMetadata {
  isEncrypted: boolean
  keyFingerprint?: string
  algorithm?: string
  encryptedAt?: string
  plaintextHash?: string
  contractVersion?: number
  encryptedPayload?: EncryptedPayload
}
