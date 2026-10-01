const DB_NAME = 'agentloom-keystore'
const DB_VERSION = 1
const STORE_NAME = 'private-keys'

const RSA_IMPORT_PARAMS: RsaHashedImportParams = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
}

/**
 * 私钥以不可导出（extractable=false）的 CryptoKey 结构化克隆存入 IndexedDB：
 * 页面脚本只能用它解密，无法读出 PKCS#8 字节。备份只发生在生成/导入时
 * （KeyGenerateDialog 下载 PEM），不依赖从这里导出。
 */
interface StoredKey {
  fingerprint: string
  privateKey: CryptoKey
  createdAt: string
}

/** 旧版记录直接保存 PKCS#8 原始字节，读取时迁移。 */
interface LegacyStoredKey {
  fingerprint: string
  privateKeyPkcs8: ArrayBuffer
  createdAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'fingerprint' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function importNonExtractable(pkcs8: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const bytes = pkcs8 instanceof Uint8Array ? pkcs8.slice() : new Uint8Array(pkcs8.slice(0))
  return crypto.subtle.importKey('pkcs8', bytes, RSA_IMPORT_PARAMS, false, ['decrypt'])
}

async function putRecord(record: StoredKey): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')

    // put 会同步抛出 DataCloneError；此时事务没有任何请求，必须自己关闭连接，
    // 否则后续 deleteDatabase / 版本升级会被这条悬挂连接阻塞。
    try {
      transaction.objectStore(STORE_NAME).put(record)
    } catch (error) {
      database.close()
      reject(error)
      return
    }

    transaction.oncomplete = () => {
      database.close()
      resolve()
    }

    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

export async function storePrivateKey(
  fingerprint: string,
  privateKeyPkcs8: ArrayBuffer | Uint8Array,
): Promise<void> {
  // importKey 必须在打开事务之前完成：IndexedDB 事务会在 await 期间自动提交。
  const privateKey = await importNonExtractable(privateKeyPkcs8)
  await putRecord({ fingerprint, privateKey, createdAt: new Date().toISOString() })
}

export async function getPrivateKey(fingerprint: string): Promise<CryptoKey | null> {
  const database = await openDatabase()

  const record = await new Promise<StoredKey | LegacyStoredKey | undefined>(
    (resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(fingerprint)

      request.onsuccess = () => {
        database.close()
        resolve(request.result as StoredKey | LegacyStoredKey | undefined)
      }

      request.onerror = () => {
        database.close()
        reject(request.error)
      }
    },
  )

  if (!record) {
    return null
  }

  if ('privateKey' in record) {
    return record.privateKey
  }

  const privateKey = await importNonExtractable(record.privateKeyPkcs8)

  // 写回失败不影响本次解密：返回已导入的句柄，旧记录保留，下次读取或启动迁移再试。
  try {
    await putRecord({ fingerprint, privateKey, createdAt: record.createdAt })
  } catch (error) {
    console.error(`私钥 ${fingerprint} 迁移为不可导出 CryptoKey 时写回失败，保留旧记录`, error)
  }

  return privateKey
}

async function readAllRecords(): Promise<Array<StoredKey | LegacyStoredKey>> {
  const database = await openDatabase()

  // Studio 的 TS lib 目标早于 ES2024，没有 Promise.withResolvers。
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAll()

    request.onsuccess = () => {
      database.close()
      resolve(request.result as Array<StoredKey | LegacyStoredKey>)
    }

    request.onerror = () => {
      database.close()
      reject(request.error)
    }
  })
}

export interface LegacyKeyMigrationFailure {
  fingerprint: string
  /** import：PKCS#8 无法导入；persist：导入成功但写回 IndexedDB 失败。 */
  stage: 'import' | 'persist'
  error: unknown
}

export interface LegacyKeyMigrationResult {
  migrated: number
  failed: LegacyKeyMigrationFailure[]
}

/**
 * Studio 启动时调用一次：把旧版明文 PKCS#8 记录全部改写为不可导出的 CryptoKey。
 * 任何失败都保留原记录并报告：私钥是用户不可恢复的数据，自动删除没有收益。
 * put 失败时事务中止，原记录保持不变。
 */
export async function migrateLegacyPrivateKeys(): Promise<LegacyKeyMigrationResult> {
  const result: LegacyKeyMigrationResult = { migrated: 0, failed: [] }

  for (const record of await readAllRecords()) {
    if ('privateKey' in record) {
      continue
    }

    let privateKey: CryptoKey
    try {
      privateKey = await importNonExtractable(record.privateKeyPkcs8)
    } catch (error) {
      result.failed.push({ fingerprint: record.fingerprint, stage: 'import', error })
      continue
    }

    try {
      await putRecord({
        fingerprint: record.fingerprint,
        privateKey,
        createdAt: record.createdAt,
      })
      result.migrated += 1
    } catch (error) {
      result.failed.push({ fingerprint: record.fingerprint, stage: 'persist', error })
    }
  }

  return result
}

export async function deletePrivateKey(fingerprint: string): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    store.delete(fingerprint)

    transaction.oncomplete = () => {
      database.close()
      resolve()
    }

    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

export async function listStoredFingerprints(): Promise<string[]> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAllKeys()

    request.onsuccess = () => {
      database.close()
      resolve(request.result as string[])
    }

    request.onerror = () => {
      database.close()
      reject(request.error)
    }
  })
}
