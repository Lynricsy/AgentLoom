import { SlidersHorizontal } from 'lucide-react'
import { PageContainer } from '@/shared/components/page-container/PageContainer'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'
import { GlobalModelSelector } from '@/features/llm'
import { useLlmModels } from '@/features/llm'
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
            title: '偏好已更新',
            description: '对话标题生成模型已保存。',
            variant: 'success',
          })
        },
        onError: () => {
          notify({
            title: '更新偏好失败',
            description: '请稍后重试。',
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
    <PageContainer width="narrow">
      <PageHeader
        icon={SlidersHorizontal}
        title="个人偏好"
        description="管理个人专属的 AI 行为偏好设置，这些设置仅对当前账号生效。"
      />

      <Card>
        <CardHeader>
          <CardTitle>对话标题生成</CardTitle>
          <CardDescription className="leading-relaxed">
            为自动生成对话标题单独指定一个 LLM 模型，不设置时使用组织默认模型。
          </CardDescription>
        </CardHeader>

        <CardContent className="max-w-sm">
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                className="block text-xs font-medium text-muted-foreground"
                htmlFor="title-model-select"
              >
                标题生成模型
              </label>
              <div className="flex items-center gap-2">
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
                {/* 固定占位：Spinner 出现时选择器宽度不跳 */}
                <span className="grid size-4 shrink-0 place-items-center">
                  {updateMutation.isPending ? <Spinner size="sm" /> : null}
                </span>
              </div>
              <p className="text-2xs leading-relaxed text-muted-foreground">
                选择「使用组织默认」可清除当前偏好，恢复使用组织级默认设置。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
