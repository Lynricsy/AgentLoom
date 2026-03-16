import { Injectable } from '@nestjs/common';
import {
  constants,
  createHash,
  createPublicKey,
  createVerify,
  type KeyObject,
} from 'node:crypto';

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
  verifyArchiveSignature(
    archiveBuffer: Buffer,
    signatureBase64: string | undefined,
    publicKeyPem: string,
    pluginId: string,
  ): SignatureVerificationResult {
    if (!signatureBase64) {
      throw new PluginSignatureMissingException(pluginId);
    }

    this.validatePublicKey(publicKeyPem);

    const contentHash = this.computeContentHash(archiveBuffer);
    const valid = this.verifyRsaPssSignature(
      archiveBuffer,
      signatureBase64,
      publicKeyPem,
    );

    if (!valid) {
      throw new PluginSignatureInvalidException(pluginId);
    }

    return { valid: true, contentHash };
  }

  computeContentHash(data: Buffer | Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
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
    const publicKey = createPublicKey(pem);
    const der = publicKey.export({ type: 'spki', format: 'der' });

    return createHash('sha256').update(der).digest('hex');
  }

  private verifyRsaPssSignature(
    data: Buffer | Uint8Array,
    signatureBase64: string,
    publicKeyPem: string,
  ): boolean {
    try {
      const verify = createVerify('SHA256');
      verify.update(data);
      verify.end();

      return verify.verify(
        {
          key: publicKeyPem,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
        },
        Buffer.from(signatureBase64, 'base64'),
      );
    } catch {
      return false;
    }
  }
}
