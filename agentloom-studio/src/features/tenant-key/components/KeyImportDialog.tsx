import { memo, useCallback, useState } from 'react'
import { AlertTriangle, Import, Loader2 } from 'lucide-react'

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
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

import { useUploadPublicKey } from '../api/tenantKeyMutations'
import { importPrivateKeyPem, privateKeyPemToPkcs8 } from '../lib/clientCrypto'
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

async function extractPublicKeyPem(privateKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
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
        message:
          '无效的 PEM 格式。请粘贴以 "-----BEGIN PRIVATE KEY-----" 开头的完整私钥。',
      })
      return
    }

    try {
      setState({ step: 'processing' })

      const privateKey = await importPrivateKeyPem(trimmed, {
        extractable: true,
      })
      const privateKeyPkcs8 = privateKeyPemToPkcs8(trimmed)
      const publicKeyPem = await extractPublicKeyPem(privateKey)
      const fingerprint = await computeFingerprint(publicKeyPem)

      await uploadMutation.mutateAsync({ publicKey: publicKeyPem })
      await storePrivateKey(fingerprint, privateKeyPkcs8)

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="key-import-dialog"
        hideClose={state.step === 'processing'}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="size-5 text-primary" />
            导入私钥
          </DialogTitle>
          <DialogDescription>
            粘贴 PEM 编码的 RSA 私钥。系统将自动提取公钥并上传到服务端。
          </DialogDescription>
        </DialogHeader>

        {state.step === 'input' && (
          <>
            <DialogBody className="space-y-4">
              <div>
                <label htmlFor="pem-input">
                  <Label>私钥 (PEM)</Label>
                </label>
                <Textarea
                  id="pem-input"
                  className="mt-2 h-48 resize-none font-mono text-xs"
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  value={pemInput}
                  onChange={(e) => setPemInput(e.target.value)}
                />
              </div>

              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-xs leading-relaxed text-warning">
                    私钥不会发送到服务器，浏览器本地仅保存二进制密钥材料而非 PEM
                    明文字符串。
                    但浏览器扩展、同源脚本或本机受损时仍可能读取本地密钥材料。
                  </p>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button
                onClick={handleImport}
                disabled={!pemInput.trim().startsWith(PEM_HEADER)}
              >
                导入
              </Button>
            </DialogFooter>
          </>
        )}

        {state.step === 'processing' && (
          <DialogBody>
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                正在验证并导入私钥…
              </p>
            </div>
          </DialogBody>
        )}

        {state.step === 'done' && (
          <>
            <DialogBody>
              <div className="rounded-lg border border-success/20 bg-success/5 p-3">
                <p className="text-sm font-medium text-success">私钥导入成功</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  指纹：{state.fingerprint}
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
                <p className="text-sm font-medium text-error">导入失败</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {state.message}
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">关闭</Button>
              </DialogClose>
              <Button onClick={() => setState({ step: 'input' })}>重试</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})
