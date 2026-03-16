import { constants, createSign } from 'node:crypto';

import { computeSha256Hex, createCanonicalArchivePayload } from './archive';

export async function computeContentHash(data: Buffer | Uint8Array): Promise<string> {
  const canonicalPayload = await createCanonicalArchivePayload(data);
  return computeSha256Hex(canonicalPayload);
}

export async function signArchive(
  data: Buffer | Uint8Array,
  privateKeyPem: string,
): Promise<string> {
  const canonicalPayload = await createCanonicalArchivePayload(data);
  const sign = createSign('SHA256');
  sign.update(canonicalPayload);
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
