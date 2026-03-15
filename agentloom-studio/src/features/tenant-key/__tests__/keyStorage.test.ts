import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  deletePrivateKey,
  getPrivateKey,
  listStoredFingerprints,
  storePrivateKey,
} from '../lib/keyStorage'

const DB_NAME = 'agentloom-keystore'

beforeEach(async () => {
  await resetDatabase()
})

describe('keyStorage', () => {
  it('stores and retrieves a private key by fingerprint', async () => {
    await storePrivateKey('fingerprint-1', 'private-key-1')

    await expect(getPrivateKey('fingerprint-1')).resolves.toBe('private-key-1')
  })

  it('returns null when the fingerprint does not exist', async () => {
    await expect(getPrivateKey('missing')).resolves.toBeNull()
  })

  it('deletes a stored private key', async () => {
    await storePrivateKey('fingerprint-1', 'private-key-1')

    await deletePrivateKey('fingerprint-1')

    await expect(getPrivateKey('fingerprint-1')).resolves.toBeNull()
  })

  it('lists all stored fingerprints', async () => {
    await storePrivateKey('fingerprint-1', 'private-key-1')
    await storePrivateKey('fingerprint-2', 'private-key-2')

    await expect(listStoredFingerprints()).resolves.toEqual([
      'fingerprint-1',
      'fingerprint-2',
    ])
  })

  it('overwrites an existing key for the same fingerprint', async () => {
    await storePrivateKey('fingerprint-1', 'private-key-1')
    await storePrivateKey('fingerprint-1', 'private-key-updated')

    await expect(getPrivateKey('fingerprint-1')).resolves.toBe('private-key-updated')
    await expect(listStoredFingerprints()).resolves.toEqual(['fingerprint-1'])
  })
})

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('删除测试 IndexedDB 时被阻塞'))
  })
}
