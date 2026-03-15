import { memo, useCallback, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react'

import { Button } from '@/shared/ui/button'

import { useRotateTenantKey } from '../api/tenantKeyMutations'
import { generateRsaKeyPair } from '../lib/clientCrypto'
import { storePrivateKey } from '../lib/keyStorage'

interface KeyRotateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  keyId: string
  currentFingerprint: string
  onSuccess?: () => void
}

type RotateState =
  | { step: 'confirm' }
  | { step: 'generating' }
  | { step: 'uploading' }
  | { step: 'done'; newFingerprint: string }
  | { step: 'error'; message: string }

export const KeyRotateDialog = memo(function KeyRotateDialog({
  open,
  onOpenChange,
  keyId,
  currentFingerprint,
  onSuccess,
}: KeyRotateDialogProps) {
  const [state, setState] = useState<RotateState>({ step: 'confirm' })
  const rotateMutation = useRotateTenantKey()

  const handleRotate = useCallback(async () => {
    try {
      setState({ step: 'generating' })
      const keyPair = await generateRsaKeyPair()

      setState({ step: 'uploading' })
      await rotateMutation.mutateAsync({
        keyId,
        payload: { publicKey: keyPair.publicKeyPem },
      })

      await storePrivateKey(keyPair.fingerprint, keyPair.privateKeyPem)

      setState({ step: 'done', newFingerprint: keyPair.fingerprint })
      onSuccess?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '密钥轮换失败，请重试'
      setState({ step: 'error', message })
    }
  }, [keyId, rotateMutation, onSuccess])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setState({ step: 'confirm' })
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  const isProcessing = state.step === 'generating' || state.step === 'uploading'

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl"
          data-testid="key-rotate-dialog"
        >
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3 h-8 w-8 p-0"
              aria-label="关闭"
              disabled={isProcessing}
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>

          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
            <RefreshCw className="h-5 w-5 text-primary" />
            轮换加密密钥
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            生成新的密钥对并替换当前密钥。旧密钥加密的数据仍需旧私钥解密。
          </Dialog.Description>

          <div className="mt-5 space-y-4">
            {state.step === 'confirm' && (
              <>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    当前密钥指纹
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">
                    {currentFingerprint}
                  </p>
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="space-y-1 text-xs leading-relaxed text-amber-700">
                      <p>
                        轮换后，新数据将使用新密钥加密。请注意：
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 pl-1">
                        <li>已用旧密钥加密的数据仍需旧私钥解密</li>
                        <li>请确保已备份旧私钥</li>
                        <li>新私钥生成后请立即下载备份</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">取消</Button>
                  </Dialog.Close>
                  <Button onClick={handleRotate}>确认轮换</Button>
                </div>
              </>
            )}

            {isProcessing && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {state.step === 'generating'
                    ? '正在生成新的 RSA-4096 密钥对…'
                    : '正在上传新公钥…'}
                </p>
              </div>
            )}

            {state.step === 'done' && (
              <>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-sm font-medium text-emerald-600">
                    密钥轮换成功
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    新指纹：{state.newFingerprint}
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
                  <p className="text-sm font-medium text-rose-600">轮换失败</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {state.message}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">关闭</Button>
                  </Dialog.Close>
                  <Button onClick={handleRotate}>重试</Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
