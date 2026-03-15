export const ENCRYPTION_KEY_STATUSES = [
  'active',
  'rotating',
  'revoked',
] as const

export type EncryptionKeyStatus = (typeof ENCRYPTION_KEY_STATUSES)[number]

export interface TenantKeyResponse {
  id: string
  orgId: string
  keyFingerprint: string
  status: EncryptionKeyStatus
  activatedAt: string | null
  rotatedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TenantKeyDetailResponse extends TenantKeyResponse {
  publicKey: string
}

export interface UploadPublicKeyPayload {
  publicKey: string
}

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
  fingerprint: string
}

export interface EncryptionMetadata {
  isEncrypted: boolean
  keyFingerprint?: string
  algorithm?: string
  encryptedAt?: string
}
