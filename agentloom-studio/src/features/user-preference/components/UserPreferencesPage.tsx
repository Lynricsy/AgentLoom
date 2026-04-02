import { SlidersHorizontal, Loader2 } from 'lucide-react'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'
import { GlobalModelSelector } from '@/features/llm/components/GlobalModelSelector'
import { useLlmModels } from '@/features/llm/hooks/useLlmModels'
import { useUserPreference, useUpdateUserPreference } from '../hooks/useUserPreference'

export function UserPreferencesPage() {
  const { notify } = useToast()
  const {
    data: preference,
    isLoading: isPreferenceLoading,
  } = useUserPreference()
  const {
    data: llmModels,
    isLoading: isModelsLoading,
  } = useLlmModels()
  const updateMutation = useUpdateUserPreference()

  const isLoading = isPreferenceLoading || isModelsLoading

  // 找到组织默认 chat 模型
  const defaultModel = llmModels?.find((m) => (m.modelType === 'chat' || !m.modelType) && m.isDefault) ?? null

  function handleModelChange(value: string) {
    const titleModelConfigId = value === '' ? null : value

    updateMutation.mutate(
      { titleModelConfigId },
      {
        onSuccess: () => {
          notify({
            title: '偏好已保存',
            description: '标题生成模型偏好已更新。',
            variant: 'success',
          })
        },
        onError: () => {
          notify({
            title: '保存失败',
            description: '更新偏好时出现错误，请稍后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  const currentValue = preference?.titleModelConfigId ?? ''
  const defaultModelLabel = defaultModel
    ? `使用组织默认（${defaultModel.name}）`
    : '使用组织默认'

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-foreground">
          <SlidersHorizontal className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">个人偏好</h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          管理个人专属的 AI 行为偏好设置，这些设置仅对当前账号生效。
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">对话标题生成</h2>
          <p className="text-sm text-muted-foreground">
            为自动生成对话标题单独指定一个 LLM 模型，不设置时使用组织默认模型。
          </p>
        </div>

        <div className="mt-5 max-w-sm">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ) : (
            <label className="space-y-2 text-sm text-foreground" htmlFor="title-model-select">
              <span>标题生成模型</span>
              <div className="relative flex items-center gap-2">
                <GlobalModelSelector
                  id="title-model-select"
                  value={currentValue}
                  onValueChange={handleModelChange}
                  modelType="chat"
                  placeholder={defaultModelLabel}
                  disabled={updateMutation.isPending}
                  aria-label="标题生成模型"
                  className="flex-1"
                />
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <span className="block text-xs leading-5 text-muted-foreground">
                选择「使用组织默认」可清除当前偏好，恢复使用组织级默认设置。
              </span>
            </label>
          )}
        </div>
      </section>
    </div>
  )
}
