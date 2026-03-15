import { Crypto } from '@peculiar/webcrypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EncryptedPayload, GeneratedKeyPair } from '../types'
import {
  decryptWithPrivateKey,
  exportPrivateKeyPem,
  exportPrivateKeyPkcs8,
  generateRsaKeyPair,
  importPrivateKeyPem,
} from '../lib/clientCrypto'

const encoder = new TextEncoder()

beforeEach(() => {
  vi.stubGlobal('crypto', new Crypto())
})

describe('clientCrypto', () => {
  it('generates an RSA key pair with PEM exports and SHA-256 fingerprint', async () => {
    const keyPair = await generateRsaKeyPair()

    expect(keyPair.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/)
    expect(keyPair.publicKeyPem).toMatch(/-----END PUBLIC KEY-----$/)
    expect(keyPair.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/)
    expect(keyPair.privateKeyPem).toMatch(/-----END PRIVATE KEY-----$/)
    expect(keyPair.privateKeyPkcs8).toBeInstanceOf(ArrayBuffer)
    expect(keyPair.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('decrypts an RSA-OAEP + AES-GCM payload roundtrip', async () => {
    const keyPair = await generateRsaKeyPair()
    const plaintext = '主人，这是一段需要解密的测试内容 🦊'
    const payload = await createEncryptedPayload(keyPair, plaintext)

    const decrypted = await decryptWithPrivateKey(payload, keyPair.privateKeyPem)

    expect(decrypted).toBe(plaintext)
  })

  it('imports and exports a private key PEM roundtrip', async () => {
    const generated = await generateRsaKeyPair()

    const imported = await importPrivateKeyPem(generated.privateKeyPem, {
      extractable: true,
    })
    const exported = await exportPrivateKeyPem(imported)
    const exportedPkcs8 = await exportPrivateKeyPkcs8(imported)

    expect(exported).toBe(generated.privateKeyPem)
    expect(new Uint8Array(exportedPkcs8)).toEqual(
      new Uint8Array(generated.privateKeyPkcs8),
    )
  })

  it('fails decryption when using the wrong private key', async () => {
    const sourceKeyPair = await generateRsaKeyPair()
    const wrongKeyPair = await generateRsaKeyPair()
    const payload = await createEncryptedPayload(sourceKeyPair, 'top secret')

    await expect(
      decryptWithPrivateKey(payload, wrongKeyPair.privateKeyPem),
    ).rejects.toThrow()
  })
})

async function createEncryptedPayload(
  keyPair: GeneratedKeyPair,
  plaintext: string,
): Promise<EncryptedPayload> {
  const publicKey = await importPublicKeyPem(keyPair.publicKeyPem)
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )

  const rawDek = await crypto.subtle.exportKey('raw', aesKey)
  const encryptedSessionKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    rawDek,
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aad = 'tenant-1:2026-03-15T00:00:00.000Z'
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(aad),
      tagLength: 128,
    },
    aesKey,
    encoder.encode(plaintext),
  )

  const encryptedBytes = new Uint8Array(encrypted)
  const authTagLength = 16
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - authTagLength)
  const authTag = encryptedBytes.slice(encryptedBytes.length - authTagLength)

  return {
    ciphertext: bufferToBase64(ciphertext),
    encryptedSessionKey: bufferToBase64(new Uint8Array(encryptedSessionKey)),
    iv: bufferToBase64(iv),
    authTag: bufferToBase64(authTag),
    aad,
    keyFingerprint: keyPair.fingerprint,
    algorithm: 'RSA-OAEP-4096+AES-256-GCM',
  }
}

async function importPublicKeyPem(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '')

  return crypto.subtle.importKey(
    'spki',
    base64ToBuffer(base64),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
}

function bufferToBase64(buffer: Uint8Array): string {
  const binary = Array.from(buffer)
    .map((value) => String.fromCharCode(value))
    .join('')

  return btoa(binary)
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
}
