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
        // 平台签名契约固定使用 digest 长度的 salt；AUTO 会接受任意 salt 长度。
        // server 端复用此实现验签，固定该值可确保签名口径唯一。
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
      },
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}
