import { memo, useCallback } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

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
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
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
      name: listingTitle.trim(),
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
          name: listingTitle.trim(),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="marketplace-install-dialog">
        <DialogHeader>
          <DialogTitle>安装 Marketplace {entityLabel}</DialogTitle>
          <DialogDescription>
            {isPlugin
              ? `将 "${listingTitle}" 安装到你的工作区后，可以在工作流画布中使用该插件节点。`
              : `复制 "${listingTitle}" 到你的工作区后，你可以继续编辑和运行它。`}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="install-name"
                className="block text-sm font-medium text-foreground"
              >
                {entityLabel}名称
              </label>
              <Input
                id="install-name"
                {...register('name')}
                placeholder={`输入${entityLabel}名称`}
              />
              {errors.name ? (
                <p className="text-xs font-medium text-error">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="install-description"
                className="block text-sm font-medium text-foreground"
              >
                描述 <span className="font-normal text-muted">(可选)</span>
              </label>
              <Textarea
                id="install-description"
                {...register('description')}
                rows={4}
                placeholder={`描述这个${entityLabel}的使用场景`}
              />
              {errors.description ? (
                <p className="text-xs font-medium text-error">
                  {errors.description.message}
                </p>
              ) : null}
            </div>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认安装
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})
