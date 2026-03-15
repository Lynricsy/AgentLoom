import { createHash, createPublicKey } from 'crypto';

import { TenantKeyInvalidException } from './exceptions/tenant-key.exceptions';

const MINIMUM_RSA_KEY_BITS = 4096;

function isPrivateKeyPem(pem: string): boolean {
  return /BEGIN [A-Z0-9 ]*PRIVATE KEY/.test(pem);
}

export function validateRsaPublicKey(pem: string): void {
  if (isPrivateKeyPem(pem)) {
    throw new TenantKeyInvalidException('提供的不是公钥');
  }

  try {
    const key = createPublicKey(pem);

    if (key.type !== 'public') {
      throw new TenantKeyInvalidException('提供的不是公钥');
    }

    if (key.asymmetricKeyType !== 'rsa') {
      throw new TenantKeyInvalidException(
        `不支持的密钥类型: ${key.asymmetricKeyType}，仅支持 RSA`,
      );
    }

    const keySize = key.asymmetricKeyDetails?.modulusLength;

    if (keySize !== undefined && keySize < MINIMUM_RSA_KEY_BITS) {
      throw new TenantKeyInvalidException(
        `RSA 密钥长度不足: ${keySize} bits，最低要求 ${MINIMUM_RSA_KEY_BITS} bits`,
      );
    }
  } catch (error) {
    if (error instanceof TenantKeyInvalidException) {
      throw error;
    }

    throw new TenantKeyInvalidException(
      `无效的 PEM 格式公钥: ${(error as Error).message}`,
    );
  }
}

export function computeKeyFingerprint(pem: string): string {
  const key = createPublicKey(pem);
  const der = key.export({ type: 'spki', format: 'der' });

  return createHash('sha256').update(der).digest('hex');
}
