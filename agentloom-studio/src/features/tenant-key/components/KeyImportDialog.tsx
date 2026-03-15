import { memo, useCallback, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Import, Loader2, X } from 'lucide-react'

import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'

import { useUploadPublicKey } from '../api/tenantKeyMutations'
import { exportPrivateKeyPem, importPrivateKeyPem } from '../lib/clientCrypto'
import { storePrivateKey } from '../lib/keyStorage'

interface KeyImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type ImportState =
  | { step: 'input' }
  | { step: 'processing' }
  | { step: 'done'; fingerprint: string }
  | { step: 'error'; message: string }

const PEM_HEADER = '-----BEGIN PRIVATE KEY-----'

/**
 * 从私钥 CryptoKey 导出公钥 PEM
 */
async function extractPublicKeyPem(
  privateKey: CryptoKey,
): Promise<string> {
  // 用 Web Crypto 从私钥提取公钥
  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  // 移除私钥字段以获取纯公钥
  delete jwk.d
  delete jwk.dp
  delete jwk.dq
  delete jwk.p
  delete jwk.q
  delete jwk.qi
  jwk.key_ops = ['encrypt', 'wrapKey']

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt', 'wrapKey'],
  )

  const spki = await crypto.subtle.exportKey('spki', publicKey)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)))
  const lines = b64.match(/.{1,64}/g) ?? [b64]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

/**
 * 计算 SPKI 指纹 (SHA-256)
 */
async function computeFingerprint(publicKeyPem: string): Promise<string> {
  const b64 = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const KeyImportDialog = memo(function KeyImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: KeyImportDialogProps) {
  const [pemInput, setPemInput] = useState('')
  const [state, setState] = useState<ImportState>({ step: 'input' })
  const uploadMutation = useUploadPublicKey()

  const handleImport = useCallback(async () => {
    const trimmed = pemInput.trim()
    if (!trimmed.startsWith(PEM_HEADER)) {
      setState({
        step: 'error',
        message: '无效的 PEM 格式。请粘贴以 "-----BEGIN PRIVATE KEY-----" 开头的完整私钥。',
      })
      return
    }

    try {
      setState({ step: 'processing' })

      const privateKey = await importPrivateKeyPem(trimmed)
      const normalizedPem = await exportPrivateKeyPem(privateKey)
      const publicKeyPem = await extractPublicKeyPem(privateKey)
      const fingerprint = await computeFingerprint(publicKeyPem)

      await uploadMutation.mutateAsync({ publicKey: publicKeyPem })
      await storePrivateKey(fingerprint, normalizedPem)

      setState({ step: 'done', fingerprint })
      onSuccess?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '私钥导入失败，请检查格式后重试'
      setState({ step: 'error', message })
    }
  }, [pemInput, uploadMutation, onSuccess])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setPemInput('')
        setState({ step: 'input' })
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl"
          data-testid="key-import-dialog"
        >
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3 h-8 w-8 p-0"
              aria-label="关闭"
              disabled={state.step === 'processing'}
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>

          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Import className="h-5 w-5 text-primary" />
            导入私钥
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            粘贴 PEM 编码的 RSA 私钥。系统将自动提取公钥并上传到服务端。
          </Dialog.Description>

          <div className="mt-5 space-y-4">
            {state.step === 'input' && (
              <>
                <div>
                  <Label>私钥 (PEM)</Label>
                  <textarea
                    id="pem-input"
                    className="mt-2 h-48 w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    value={pemInput}
                    onChange={(e) => setPemInput(e.target.value)}
                  />
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs leading-relaxed text-amber-700">
                      私钥将存储在浏览器的 IndexedDB 中，不会发送到服务器。
                      仅公钥会被上传用于加密。
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">取消</Button>
                  </Dialog.Close>
                  <Button
                    onClick={handleImport}
                    disabled={!pemInput.trim().startsWith(PEM_HEADER)}
                  >
                    导入
                  </Button>
                </div>
              </>
            )}

            {state.step === 'processing' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  正在验证并导入私钥…
                </p>
              </div>
            )}

            {state.step === 'done' && (
              <>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-sm font-medium text-emerald-600">
                    私钥导入成功
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    指纹：{state.fingerprint}
                  </p>
                </div>

                <div className="flex justify-end">
                  <Dialog.Close asChild>
                    <Button>完成</Button>
                  </Dialog.Close>
                </div>
              </>
            )}

            {state.step === 'error' && (
              <>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                  <p className="text-sm font-medium text-rose-600">导入失败</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {state.message}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">关闭</Button>
                  </Dialog.Close>
                  <Button
                    onClick={() => setState({ step: 'input' })}
                  >
                    重试
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
