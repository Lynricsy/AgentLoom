import 'fake-indexeddb/auto'

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deletePrivateKey,
  migrateLegacyPrivateKeys,
  getPrivateKey,
  listStoredFingerprints,
  storePrivateKey,
} from '../lib/keyStorage'

const DB_NAME = 'agentloom-keystore'
const STORE_NAME = 'private-keys'

let pkcs8: ArrayBuffer
let publicKey: CryptoKey

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )
  pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  publicKey = pair.publicKey
})

beforeEach(async () => {
  await resetDatabase()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('keyStorage', () => {
  it('存入后取回的是不可导出的 CryptoKey，仍能解密', async () => {
    await storePrivateKey('fingerprint-1', pkcs8)

    const key = await getPrivateKey('fingerprint-1')

    expect(key).toBeInstanceOf(CryptoKey)
    expect(key?.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('pkcs8', key!)).rejects.toThrow()

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      new TextEncoder().encode('secret'),
    )
    const plaintext = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      key!,
      ciphertext,
    )
    expect(new TextDecoder().decode(plaintext)).toBe('secret')
  })

  it('IndexedDB 记录里不再保存原始私钥字节', async () => {
    await storePrivateKey('fingerprint-1', pkcs8)

    const record = await readRawRecord('fingerprint-1')

    expect(record).not.toHaveProperty('privateKeyPkcs8')
    expect(Object.values(record ?? {}).some((v) => v instanceof ArrayBuffer)).toBe(false)
  })

  it('旧版原始字节记录在读取时迁移为不可导出 CryptoKey', async () => {
    await writeRawRecord({
      fingerprint: 'legacy',
      privateKeyPkcs8: pkcs8.slice(0),
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const key = await getPrivateKey('legacy')

    expect(key?.extractable).toBe(false)
    const migrated = await readRawRecord('legacy')
    expect(migrated).not.toHaveProperty('privateKeyPkcs8')
    expect(migrated?.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('启动迁移一次性把所有旧明文记录转为不可导出 CryptoKey，并跳过已迁移记录', async () => {
    await writeRawRecord({
      fingerprint: 'legacy-a',
      privateKeyPkcs8: pkcs8.slice(0),
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await writeRawRecord({
      fingerprint: 'legacy-b',
      privateKeyPkcs8: pkcs8.slice(0),
      createdAt: '2026-01-02T00:00:00.000Z',
    })
    await storePrivateKey('current', pkcs8)

    await expect(migrateLegacyPrivateKeys()).resolves.toEqual({ migrated: 2, failed: [] })

    for (const fingerprint of ['legacy-a', 'legacy-b', 'current']) {
      const record = await readRawRecord(fingerprint)
      expect(record).not.toHaveProperty('privateKeyPkcs8')
      expect((record?.privateKey as CryptoKey).extractable).toBe(false)
    }
    await expect(migrateLegacyPrivateKeys()).resolves.toEqual({ migrated: 0, failed: [] })
  })

  it('启动迁移遇到无法导入的旧记录时保留原记录并记为 import 失败，不阻塞其余记录', async () => {
    const brokenBytes = new Uint8Array([1, 2, 3])
    await writeRawRecord({
      fingerprint: 'broken',
      privateKeyPkcs8: brokenBytes.buffer.slice(0),
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await writeRawRecord({
      fingerprint: 'legacy',
      privateKeyPkcs8: pkcs8.slice(0),
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const result = await migrateLegacyPrivateKeys()

    expect(result.migrated).toBe(1)
    expect(result.failed).toEqual([
      { fingerprint: 'broken', stage: 'import', error: expect.anything() },
    ])
    const broken = await readRawRecord('broken')
    expect(new Uint8Array(broken?.privateKeyPkcs8 as ArrayBuffer)).toEqual(brokenBytes)
    expect(await readRawRecord('legacy')).not.toHaveProperty('privateKeyPkcs8')
  })

  it('启动迁移导入成功但写回失败时保留原 PKCS#8 记录并记为 persist 失败', async () => {
    await writeRawRecord({
      fingerprint: 'legacy',
      privateKeyPkcs8: pkcs8.slice(0),
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    failCryptoKeyPuts()

    const result = await migrateLegacyPrivateKeys()

    expect(result.migrated).toBe(0)
    expect(result.failed).toEqual([
      { fingerprint: 'legacy', stage: 'persist', error: expect.any(DOMException) },
    ])
    const record = await readRawRecord('legacy')
    expect(new Uint8Array(record?.privateKeyPkcs8 as ArrayBuffer)).toEqual(
      new Uint8Array(pkcs8),
    )
    expect(record?.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('读时迁移写回失败时仍返回可用的 CryptoKey，并保留原记录', async () => {
    await writeRawRecord({
      fingerprint: 'legacy',
      privateKeyPkcs8: pkcs8.slice(0),
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    failCryptoKeyPuts()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const key = await getPrivateKey('legacy')

    expect(key?.extractable).toBe(false)
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      new TextEncoder().encode('secret'),
    )
    const plaintext = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key!, ciphertext)
    expect(new TextDecoder().decode(plaintext)).toBe('secret')
    expect(new Uint8Array((await readRawRecord('legacy'))?.privateKeyPkcs8 as ArrayBuffer)).toEqual(
      new Uint8Array(pkcs8),
    )
    expect(consoleError).toHaveBeenCalled()
  })

  it('returns null when the fingerprint does not exist', async () => {
    await expect(getPrivateKey('missing')).resolves.toBeNull()
  })

  it('deletes a stored private key', async () => {
    await storePrivateKey('fingerprint-1', pkcs8)

    await deletePrivateKey('fingerprint-1')

    await expect(getPrivateKey('fingerprint-1')).resolves.toBeNull()
  })

  it('lists all stored fingerprints', async () => {
    await storePrivateKey('fingerprint-1', pkcs8)
    await storePrivateKey('fingerprint-2', pkcs8)

    await expect(listStoredFingerprints()).resolves.toEqual([
      'fingerprint-1',
      'fingerprint-2',
    ])
  })
})

/** 让写入 CryptoKey 记录的 put 抛出 DataCloneError（IndexedDB 结构化克隆失败时的真实表现）。 */
function failCryptoKeyPuts() {
  const originalPut = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (value !== null && typeof value === 'object' && 'privateKey' in value) {
      throw new DOMException('mock clone failure', 'DataCloneError')
    }
    return originalPut.call(this, value, key)
  })
}

function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'fingerprint' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readRawRecord(
  fingerprint: string,
): Promise<Record<string, unknown> | undefined> {
  const database = await openRaw()
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(fingerprint)
    request.onsuccess = () => {
      database.close()
      resolve(request.result as Record<string, unknown> | undefined)
    }
    request.onerror = () => reject(request.error)
  })
}

async function writeRawRecord(record: Record<string, unknown>): Promise<void> {
  const database = await openRaw()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('删除测试 IndexedDB 时被阻塞'))
  })
}
