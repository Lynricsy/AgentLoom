import { constants, createHash, createSign } from 'node:crypto';

export function computeContentHash(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function signArchive(data: Buffer | Uint8Array, privateKeyPem: string): string {
  const sign = createSign('SHA256');
  sign.update(data);
  sign.end();

  return sign.sign(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64',
  );
}
