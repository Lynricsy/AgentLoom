import { Injectable } from '@nestjs/common';
import {
  createHash,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';

import {
  computeContentHash as computeArchiveContentHash,
  verifyArchiveSignature as verifyPluginArchiveSignature,
} from '@agentloom/plugin-sdk';

import {
  PluginDeveloperKeyInvalidException,
  PluginSignatureInvalidException,
  PluginSignatureMissingException,
} from './plugin.exceptions';

export interface SignatureVerificationResult {
  valid: boolean;
  contentHash: string;
}

function isPrivateKeyPem(pem: string): boolean {
  return /BEGIN [A-Z0-9 ]*PRIVATE KEY/.test(pem);
}

@Injectable()
export class PluginSignatureService {
  async verifyArchiveSignature(
    archiveBuffer: Buffer,
    signatureBase64: string | undefined,
    publicKeyPem: string,
    pluginId: string,
  ): Promise<SignatureVerificationResult> {
    if (!signatureBase64) {
      throw new PluginSignatureMissingException(pluginId);
    }

    this.validatePublicKey(publicKeyPem);

    const contentHash = await this.computeContentHash(archiveBuffer);
    const valid = await verifyPluginArchiveSignature(
      archiveBuffer,
      signatureBase64,
      publicKeyPem,
    );

    if (!valid) {
      throw new PluginSignatureInvalidException(pluginId);
    }

    return { valid: true, contentHash };
  }

  async computeContentHash(data: Buffer | Uint8Array): Promise<string> {
    return computeArchiveContentHash(data);
  }

  validatePublicKey(pem: string): KeyObject {
    if (isPrivateKeyPem(pem)) {
      throw new PluginDeveloperKeyInvalidException(
        '提供的密钥不是公钥。请勿使用私钥。',
      );
    }

    let publicKey: KeyObject;
    try {
      publicKey = createPublicKey(pem);
    } catch {
      throw new PluginDeveloperKeyInvalidException(
        '无法解析公钥。请提供有效的 PEM 格式 RSA 公钥。',
      );
    }

    if (publicKey.type !== 'public') {
      throw new PluginDeveloperKeyInvalidException(
        '提供的密钥不是公钥。请勿使用私钥。',
      );
    }

    if (publicKey.asymmetricKeyType !== 'rsa') {
      throw new PluginDeveloperKeyInvalidException(
        `不支持的密钥类型 "${publicKey.asymmetricKeyType}"。仅支持 RSA 密钥。`,
      );
    }

    const keySizeBits = publicKey.asymmetricKeyDetails?.modulusLength;
    if (keySizeBits !== undefined && keySizeBits < 2048) {
      throw new PluginDeveloperKeyInvalidException(
        `RSA 密钥长度 ${keySizeBits} 位不满足最低要求。需要 2048 位或更长。`,
      );
    }

    return publicKey;
  }

  computeKeyFingerprint(pem: string): string {
    const publicKey = this.validatePublicKey(pem);
    const der = publicKey.export({ type: 'spki', format: 'der' });

    return createHash('sha256').update(der).digest('hex');
  }
}
