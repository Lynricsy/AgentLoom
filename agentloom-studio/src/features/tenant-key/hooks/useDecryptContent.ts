import { useCallback, useState } from 'react'

import { decryptWithPrivateKey } from '../lib/clientCrypto'
import { getPrivateKey } from '../lib/keyStorage'
import type { EncryptedPayload } from '../types'

interface DecryptResult {
  decrypt: (payload: EncryptedPayload) => Promise<string | null>
  isDecrypting: boolean
  error: string | null
  clearError: () => void
}

export function useDecryptContent(): DecryptResult {
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decrypt = useCallback(
    async (payload: EncryptedPayload): Promise<string | null> => {
      setError(null)
      setIsDecrypting(true)

      try {
        const privateKeyPem = await getPrivateKey(payload.keyFingerprint)

        if (!privateKeyPem) {
          setError('需要私钥才能查看加密内容。请在加密设置中导入对应的私钥。')
          return null
        }

        const plaintext = await decryptWithPrivateKey(payload, privateKeyPem)
        return plaintext
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : '解密失败，请确认私钥是否正确'
        setError(message)
        return null
      } finally {
        setIsDecrypting(false)
      }
    },
    [],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { decrypt, isDecrypting, error, clearError }
}
