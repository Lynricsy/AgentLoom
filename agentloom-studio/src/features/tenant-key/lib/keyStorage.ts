const DB_NAME = 'agentloom-keystore'
const DB_VERSION = 1
const STORE_NAME = 'private-keys'

interface StoredKey {
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

function closeDatabase(database: IDBDatabase) {
  database.close()
}

export async function storePrivateKey(
  fingerprint: string,
  privateKeyPkcs8: ArrayBuffer | Uint8Array,
): Promise<void> {
  const database = await openDatabase()
  const normalizedKey =
    privateKeyPkcs8 instanceof Uint8Array
      ? (() => {
          const cloned = new Uint8Array(privateKeyPkcs8.byteLength)
          cloned.set(privateKeyPkcs8)
          return cloned.buffer
        })()
      : privateKeyPkcs8.slice(0)

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    store.put({
      fingerprint,
      privateKeyPkcs8: normalizedKey,
      createdAt: new Date().toISOString(),
    } satisfies StoredKey)

    transaction.oncomplete = () => {
      closeDatabase(database)
      resolve()
    }

    transaction.onerror = () => {
      closeDatabase(database)
      reject(transaction.error)
    }

    transaction.onabort = () => {
      closeDatabase(database)
      reject(transaction.error)
    }
  })
}

export async function getPrivateKey(fingerprint: string): Promise<ArrayBuffer | null> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(fingerprint)

    request.onsuccess = () => {
      closeDatabase(database)
      const result = request.result as StoredKey | undefined
      resolve(result?.privateKeyPkcs8 ?? null)
    }

    request.onerror = () => {
      closeDatabase(database)
      reject(request.error)
    }
  })
}

export async function deletePrivateKey(fingerprint: string): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    store.delete(fingerprint)

    transaction.oncomplete = () => {
      closeDatabase(database)
      resolve()
    }

    transaction.onerror = () => {
      closeDatabase(database)
      reject(transaction.error)
    }

    transaction.onabort = () => {
      closeDatabase(database)
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
      closeDatabase(database)
      resolve(request.result as string[])
    }

    request.onerror = () => {
      closeDatabase(database)
      reject(request.error)
    }
  })
}
