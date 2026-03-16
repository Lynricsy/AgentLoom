import { constants, createVerify } from 'node:crypto';

export function verifyArchiveSignature(
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
