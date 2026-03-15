import type { EncryptedPayload, GeneratedKeyPair } from '../types'

const RSA_KEY_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

const RSA_IMPORT_PARAMS: RsaHashedImportParams = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
}

const AES_KEY_PARAMS: AesKeyGenParams = {
  name: 'AES-GCM',
  length: 256,
}

export async function generateRsaKeyPair(): Promise<GeneratedKeyPair> {
  const keyPair = await crypto.subtle.generateKey(RSA_KEY_PARAMS, true, [
    'encrypt',
    'decrypt',
  ])

  const publicKeyDer = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const privateKeyDer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

  const publicKeyPem = derToPem(publicKeyDer, 'PUBLIC KEY')
  const privateKeyPem = derToPem(privateKeyDer, 'PRIVATE KEY')

  const fingerprintBuffer = await crypto.subtle.digest('SHA-256', publicKeyDer)
  const fingerprint = bufferToHex(new Uint8Array(fingerprintBuffer))

  return {
    publicKeyPem,
    privateKeyPem,
    fingerprint,
  }
}

export async function decryptWithPrivateKey(
  payload: EncryptedPayload,
  privateKeyPem: string,
): Promise<string> {
  const privateKey = await importPrivateKeyPem(privateKeyPem)

  const encryptedDek = base64ToBuffer(payload.encryptedSessionKey)
  const dek = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedDek,
  )

  const aesKey = await crypto.subtle.importKey(
    'raw',
    dek,
    AES_KEY_PARAMS,
    false,
    ['decrypt'],
  )

  const iv = base64ToBuffer(payload.iv)
  const ciphertext = new Uint8Array(base64ToBuffer(payload.ciphertext))
  const authTag = new Uint8Array(base64ToBuffer(payload.authTag))
  const aad = new TextEncoder().encode(payload.aad)

  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length)
  ciphertextWithTag.set(ciphertext, 0)
  ciphertextWithTag.set(authTag, ciphertext.length)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: 128,
    },
    aesKey,
    ciphertextWithTag,
  )

  return new TextDecoder().decode(decrypted)
}

export async function exportPrivateKeyPem(privateKey: CryptoKey): Promise<string> {
  const der = await crypto.subtle.exportKey('pkcs8', privateKey)
  return derToPem(der, 'PRIVATE KEY')
}

export async function importPrivateKeyPem(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem)
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    RSA_IMPORT_PARAMS,
    true,
    ['decrypt'],
  )
}

function derToPem(der: ArrayBuffer, label: string): string {
  const base64 = bufferToBase64(new Uint8Array(der))
  const lines = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '')

  return base64ToBuffer(base64)
}

function bufferToBase64(buffer: Uint8Array): string {
  const binary = Array.from(buffer)
    .map((value) => String.fromCharCode(value))
    .join('')

  return btoa(binary)
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const buffer = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    buffer[index] = binary.charCodeAt(index)
  }

  return buffer.buffer
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}
