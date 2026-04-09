import { memo, useCallback } from 'react'

import * as Dialog from '@radix-ui/react-dialog'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import { useInstallListing } from '../api/publicMarketplaceMutations'
import type { MarketplaceListingType } from '../types'

const workflowInstallFormSchema = z.object({
  name: z.string().min(1, '请输入工作流名称').max(255),
  description: z.string().max(2000).optional(),
})

const pluginInstallFormSchema = z.object({
  name: z.string().min(1, '请输入名称').max(255),
  description: z.string().max(2000).optional(),
})

type InstallFormValues = z.infer<typeof workflowInstallFormSchema>

interface MarketplaceInstallDialogProps {
  listingId: string
  listingTitle: string
  listingSummary?: string
  listingType: MarketplaceListingType
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getDefaultName(listingTitle: string) {
  return listingTitle.trim()
}

export const MarketplaceInstallDialog = memo(function MarketplaceInstallDialog({
  listingId,
  listingTitle,
  listingSummary,
  listingType,
  open,
  onOpenChange,
}: MarketplaceInstallDialogProps) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const installListing = useInstallListing()
  const isPlugin = listingType === 'plugin'

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InstallFormValues>({
    resolver: zodResolver(isPlugin ? pluginInstallFormSchema : workflowInstallFormSchema),
    values: {
      name: getDefaultName(listingTitle),
      description: listingSummary ?? '',
    },
  })

  const onSubmit = useCallback(
    async (values: InstallFormValues) => {
      try {
        const result = await installListing.mutateAsync({
          id: listingId,
          body: {
            name: values.name,
            description: values.description?.trim() || undefined,
          },
        })

        onOpenChange(false)
        reset({
          name: getDefaultName(listingTitle),
          description: listingSummary ?? '',
        })
        notify({
          title: '安装成功',
          description: `"${result.name}" 已添加到你的工作区。`,
          variant: 'success',
        })

        if ('workflowDefinitionId' in result) {
          navigate({
            to: '/workflows/$workflowId',
            params: { workflowId: result.workflowDefinitionId },
          })
        }
      } catch {
        notify({
          title: '安装失败',
          description: isPlugin
            ? '无法安装这个插件，请稍后重试。'
            : '无法安装这个工作流，请稍后重试。',
          variant: 'error',
        })
      }
    },
    [installListing, isPlugin, listingId, listingSummary, listingTitle, navigate, notify, onOpenChange, reset],
  )

  const isPending = isSubmitting || installListing.isPending

  const entityLabel = isPlugin ? '插件' : '工作流'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[80] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out-0"
          data-testid="marketplace-install-dialog"
        >
          <Dialog.Close className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </Dialog.Close>

          <Dialog.Title className="text-base font-medium">
            安装 Marketplace {entityLabel}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {isPlugin
              ? `将 "${listingTitle}" 安装到你的工作区后，可以在工作流画布中使用该插件节点。`
              : `复制 "${listingTitle}" 到你的工作区后，你可以继续编辑和运行它。`}
          </Dialog.Description>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="install-name" className="mb-1.5 block text-sm font-medium">
                {entityLabel}名称
              </label>
              <input
                id="install-name"
                {...register('name')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={`输入${entityLabel}名称`}
              />
              {errors.name ? (
                <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="install-description" className="mb-1.5 block text-sm font-medium">
                描述 <span className="font-normal text-muted-foreground">(可选)</span>
              </label>
              <textarea
                id="install-description"
                {...register('description')}
                rows={4}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={`描述这个${entityLabel}的使用场景`}
              />
              {errors.description ? (
                <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                确认安装
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
