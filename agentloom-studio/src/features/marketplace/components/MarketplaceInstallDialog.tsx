import { memo, useCallback, useEffect, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { ChatModelSelect, useUsableChatModels } from '@/features/llm'
import { resolveProblemDetail } from '@/shared/api/problemDetail'
import { FormField } from '@/shared/components/form-field/FormField'
import { fadeIn } from '@/shared/lib/motion'
import { Button, buttonVariants } from '@/shared/ui/button'
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
import { cn } from '@/shared/lib/utils'
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

  /** 插件安装成功后停在成功态，给出去插件管理页的去处，而不是直接关掉对话框 */
  const [installedPluginName, setInstalledPluginName] = useState<string | null>(
    null,
  )
  /** 仅工作流 listing：作者的模型在当前账号不存在时，Agent 改用的备用模型 */
  const [modelConfigId, setModelConfigId] = useState<string | undefined>()
  const usableChatModels = useUsableChatModels({ enabled: !isPlugin })

  useEffect(() => {
    if (!open) {
      setInstalledPluginName(null)
      setModelConfigId(undefined)
    }
  }, [open])

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
            modelConfigId,
          },
        })

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
          onOpenChange(false)
          navigate({
            to: '/workflows/$workflowId',
            params: { workflowId: result.workflowDefinitionId },
          })
          return
        }

        setInstalledPluginName(result.name)
      } catch (error) {
        notify({
          title: '安装失败',
          description: resolveProblemDetail(
            error,
            isPlugin
              ? '无法安装这个插件，请稍后重试。'
              : '无法安装这个工作流，请稍后重试。',
          ),
          variant: 'error',
        })
      }
    },
    [installListing, isPlugin, listingId, listingSummary, listingTitle, modelConfigId, navigate, notify, onOpenChange, reset],
  )

  const isPending = isSubmitting || installListing.isPending

  const entityLabel = isPlugin ? '插件' : '工作流'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="marketplace-install-dialog">
        <DialogHeader>
          <DialogTitle>安装 Marketplace {entityLabel}</DialogTitle>
          <DialogDescription className="break-words">
            {isPlugin
              ? `将「${listingTitle}」安装到你的工作区后，可以在工作流画布中使用该插件节点。`
              : `复制「${listingTitle}」到你的工作区后，你可以继续编辑和运行它。`}
          </DialogDescription>
        </DialogHeader>

        {/* 视图切换只做入场淡入（key 变化即重挂载）：结果态必须同步出现，不等旧视图退场 */}
        <>
          {installedPluginName !== null ? (
            <motion.div
              key="success"
              {...fadeIn}
              className="flex min-h-0 flex-1 flex-col"
            >
              <DialogBody
                className="flex flex-col items-center gap-3 py-10"
                data-testid="plugin-install-success"
              >
                <CheckCircle2 className="size-12 text-success" />
                <p className="text-lg font-medium text-foreground">安装成功</p>
                <p className="break-words text-center text-sm text-muted-foreground">
                  {`「${installedPluginName}」已进入插件库，启用后即可在画布中使用它的节点。`}
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <Link
                    to="/resources/plugins"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    onClick={() => onOpenChange(false)}
                  >
                    前往插件管理
                  </Link>
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    完成
                  </Button>
                </div>
              </DialogBody>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              {...fadeIn}
              onSubmit={handleSubmit(onSubmit)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <DialogBody className="space-y-4">
                <FormField
                  label={`${entityLabel}名称`}
                  htmlFor="install-name"
                  error={errors.name?.message}
                >
                  <Input
                    id="install-name"
                    {...register('name')}
                    placeholder={`输入${entityLabel}名称`}
                  />
                </FormField>

                <FormField
                  label={
                    <>
                      描述 <span className="font-normal text-muted-foreground">（可选）</span>
                    </>
                  }
                  htmlFor="install-description"
                  error={errors.description?.message}
                >
                  <Textarea
                    id="install-description"
                    {...register('description')}
                    rows={4}
                    placeholder={`描述这个${entityLabel}的使用场景`}
                  />
                </FormField>

                {isPlugin ? null : (
                  <FormField
                    label={
                      <>
                        备用模型 <span className="font-normal text-muted-foreground">（可选）</span>
                      </>
                    }
                    htmlFor="install-fallback-model"
                    hint="作者使用的模型在你的账号中不存在时，Agent 改用这个模型。"
                  >
                    <ChatModelSelect
                      id="install-fallback-model"
                      data-testid="install-fallback-model-select"
                      value={modelConfigId}
                      onValueChange={setModelConfigId}
                      models={usableChatModels.data ?? []}
                      disabled={isPending}
                    />
                  </FormField>
                )}
              </DialogBody>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    取消
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="animate-spin" /> : null}
                  确认安装
                </Button>
              </DialogFooter>
            </motion.form>
          )}
        </>
      </DialogContent>
    </Dialog>
  )
})
