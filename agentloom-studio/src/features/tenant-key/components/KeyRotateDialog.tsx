import { memo, useCallback, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'

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

      await storePrivateKey(keyPair.fingerprint, keyPair.privateKeyPkcs8)

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="key-rotate-dialog" hideClose={isProcessing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-5 text-primary" />
            轮换加密密钥
          </DialogTitle>
          <DialogDescription>
            生成新的密钥对并替换当前密钥。旧密钥加密的数据仍需旧私钥解密。
          </DialogDescription>
        </DialogHeader>

        {state.step === 'confirm' && (
          <>
            <DialogBody className="space-y-4">
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  当前密钥指纹
                </p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">
                  {currentFingerprint}
                </p>
              </div>

              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div className="space-y-1 text-xs leading-relaxed text-warning">
                    <p>轮换后，新数据将使用新密钥加密。请注意：</p>
                    <ul className="list-inside list-disc space-y-0.5 pl-1">
                      <li>已用旧密钥加密的数据仍需旧私钥解密</li>
                      <li>请确保已备份旧私钥</li>
                      <li>新私钥生成后请立即下载备份</li>
                    </ul>
                  </div>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button onClick={handleRotate}>确认轮换</Button>
            </DialogFooter>
          </>
        )}

        {isProcessing && (
          <DialogBody>
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {state.step === 'generating'
                  ? '正在生成新的 RSA-4096 密钥对…'
                  : '正在上传新公钥…'}
              </p>
            </div>
          </DialogBody>
        )}

        {state.step === 'done' && (
          <>
            <DialogBody>
              <div className="rounded-lg border border-success/20 bg-success/5 p-3">
                <p className="text-sm font-medium text-success">密钥轮换成功</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  新指纹：{state.newFingerprint}
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button>完成</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}

        {state.step === 'error' && (
          <>
            <DialogBody>
              <div className="rounded-lg border border-error/20 bg-error/5 p-3">
                <p className="text-sm font-medium text-error">轮换失败</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {state.message}
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">关闭</Button>
              </DialogClose>
              <Button onClick={handleRotate}>重试</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})
