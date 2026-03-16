import { constants, createVerify } from 'node:crypto';

import { createCanonicalArchivePayload } from './archive';

export async function verifyArchiveSignature(
  data: Buffer | Uint8Array,
  signatureBase64: string,
  publicKeyPem: string,
): Promise<boolean> {
  try {
    const canonicalPayload = await createCanonicalArchivePayload(data);
    const verify = createVerify('SHA256');
    verify.update(canonicalPayload);
    verify.end();

    return verify.verify(
      {
        key: publicKeyPem,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_AUTO,
      },
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}
