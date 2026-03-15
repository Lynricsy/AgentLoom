import { memo, useCallback, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Download, Key, Loader2, X } from 'lucide-react'

import { Button } from '@/shared/ui/button'

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
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl"
          data-testid="key-generate-dialog"
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
            <Key className="h-5 w-5 text-primary" />
            生成加密密钥对
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            生成 RSA-4096 密钥对用于端到端加密。私钥不会上传到服务器，但浏览器扩展、同源脚本或本机受损时仍可能泄露本地密钥材料。
          </Dialog.Description>

          <div className="mt-5 space-y-4">
            {state.step === 'idle' && (
              <>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs leading-relaxed text-amber-700">
                      私钥会保存到当前浏览器的本地密钥库中，无法由服务器恢复。生成后请立即下载备份。
                      更换浏览器或清除数据后将无法解密已加密内容。
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">取消</Button>
                  </Dialog.Close>
                  <Button onClick={handleGenerate}>生成密钥对</Button>
                </div>
              </>
            )}

            {isProcessing && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {state.step === 'generating'
                    ? '正在生成 RSA-4096 密钥对，请稍候…'
                    : '正在上传公钥…'}
                </p>
              </div>
            )}

            {state.step === 'done' && (
              <>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-sm font-medium text-emerald-600">
                    密钥对生成成功
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    指纹：{state.keyPair.fingerprint}
                  </p>
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs leading-relaxed text-amber-700">
                      请立即下载私钥备份。如果您丢失了私钥，将无法解密任何已加密的数据。
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDownloadPrivateKey}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    下载私钥
                  </Button>
                  <Dialog.Close asChild>
                    <Button>完成</Button>
                  </Dialog.Close>
                </div>
              </>
            )}

            {state.step === 'error' && (
              <>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                  <p className="text-sm font-medium text-rose-600">生成失败</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {state.message}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">关闭</Button>
                  </Dialog.Close>
                  <Button onClick={handleGenerate}>重试</Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
