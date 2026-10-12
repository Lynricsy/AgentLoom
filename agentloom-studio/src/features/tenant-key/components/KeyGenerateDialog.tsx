import { memo, useCallback, useState } from 'react'
import { Download, Key, Loader2 } from 'lucide-react'

import { Alert } from '@/shared/ui/alert'
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

import { useUploadPublicKey } from '../api/tenantKeyMutations'
import { generateRsaKeyPair } from '../lib/clientCrypto'
import { storePrivateKey } from '../lib/keyStorage'
import type { GeneratedKeyPair } from '../types'

interface KeyGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type GenerateState =
  | { step: 'idle' }
  | { step: 'generating' }
  | { step: 'uploading' }
  | { step: 'done'; keyPair: GeneratedKeyPair }
  | { step: 'error'; message: string }

export const KeyGenerateDialog = memo(function KeyGenerateDialog({
  open,
  onOpenChange,
  onSuccess,
}: KeyGenerateDialogProps) {
  const [state, setState] = useState<GenerateState>({ step: 'idle' })
  const uploadMutation = useUploadPublicKey()

  const handleGenerate = useCallback(async () => {
    try {
      setState({ step: 'generating' })
      const keyPair = await generateRsaKeyPair()

      setState({ step: 'uploading' })
      await uploadMutation.mutateAsync({ publicKey: keyPair.publicKeyPem })

      await storePrivateKey(keyPair.fingerprint, keyPair.privateKeyPkcs8)

      setState({ step: 'done', keyPair })
      onSuccess?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '密钥生成失败，请重试'
      setState({ step: 'error', message })
    }
  }, [uploadMutation, onSuccess])

  const handleDownloadPrivateKey = useCallback(() => {
    if (state.step !== 'done') return
    const blob = new Blob([state.keyPair.privateKeyPem], {
      type: 'application/x-pem-file',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agentloom-private-key-${state.keyPair.fingerprint.slice(0, 8)}.pem`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [state])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setState({ step: 'idle' })
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  const isProcessing = state.step === 'generating' || state.step === 'uploading'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="key-generate-dialog"
        hideClose={isProcessing}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-5 text-primary" />
            生成加密密钥对
          </DialogTitle>
          <DialogDescription>
            生成 RSA-4096
            密钥对用于端到端加密。私钥不会上传到服务器，但浏览器扩展、同源脚本或本机受损时仍可能泄露本地密钥材料。
          </DialogDescription>
        </DialogHeader>

        {state.step === 'idle' && (
          <>
            <DialogBody>
              <Alert variant="warning">
                私钥会保存到当前浏览器的本地密钥库中，无法由服务器恢复。生成后请立即下载备份。
                更换浏览器或清除数据后将无法解密已加密内容。
              </Alert>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button onClick={handleGenerate}>生成密钥对</Button>
            </DialogFooter>
          </>
        )}

        {isProcessing && (
          <DialogBody>
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {state.step === 'generating'
                  ? '正在生成 RSA-4096 密钥对，请稍候…'
                  : '正在上传公钥…'}
              </p>
            </div>
          </DialogBody>
        )}

        {state.step === 'done' && (
          <>
            <DialogBody className="space-y-4">
              <Alert variant="success" title="密钥对生成成功">
                <span className="break-all font-mono text-xs">
                  指纹：{state.keyPair.fingerprint}
                </span>
              </Alert>

              <Alert variant="warning">
                请立即下载私钥备份。如果您丢失了私钥，将无法解密任何已加密的数据。
              </Alert>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={handleDownloadPrivateKey}>
                <Download />
                下载私钥
              </Button>
              <DialogClose asChild>
                <Button>完成</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}

        {state.step === 'error' && (
          <>
            <DialogBody>
              <Alert variant="error" title="生成失败">
                {state.message}
              </Alert>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">关闭</Button>
              </DialogClose>
              <Button onClick={handleGenerate}>重试</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})
