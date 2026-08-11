import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AlertCircle, ArrowLeft, Save, Settings, X } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header/PageHeader';
import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { Spinner } from '@/shared/components/spinner/Spinner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToast } from '@/shared/ui/toast';
import {
  useMemoryInstance,
  useUpdateMemoryInstance,
} from '../hooks/useMemoryInstances';

interface MemoryInstanceSettingsPageProps {
  memoryInstanceId: string;
}

const MEMORY_TONE = 'var(--color-node-memory)';

export function MemoryInstanceSettingsPage({
  memoryInstanceId,
}: MemoryInstanceSettingsPageProps) {
  const navigate = useNavigate();
  const { notify } = useToast();
  const {
    data: instance,
    isLoading,
    isError,
  } = useMemoryInstance(memoryInstanceId);
  const updateMutation = useUpdateMemoryInstance();

  // 表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [validDomainsText, setValidDomainsText] = useState('');
  const [coreMemoryUrisText, setCoreMemoryUrisText] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [systemPromptOverride, setSystemPromptOverride] = useState('');

  // 初始化表单值
  useEffect(() => {
    if (instance) {
      setName(instance.name);
      setDescription(instance.description ?? '');
      setValidDomainsText(instance.validDomains?.join('\n') ?? '');
      setCoreMemoryUrisText(instance.coreMemoryUris?.join('\n') ?? '');
      setUseCustomPrompt(!!instance.systemPromptOverride);
      setSystemPromptOverride(instance.systemPromptOverride ?? '');
    }
  }, [instance]);

  const handleBack = useCallback(() => {
    void navigate({
      to: '/memory/$id',
      params: { id: memoryInstanceId },
    });
  }, [navigate, memoryInstanceId]);

  const handleSave = useCallback(async () => {
    const validDomains = validDomainsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const coreMemoryUris = coreMemoryUrisText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await updateMutation.mutateAsync({
        id: memoryInstanceId,
        input: {
          name: name.trim(),
          description: description.trim() || undefined,
          validDomains: validDomains.length > 0 ? validDomains : undefined,
          coreMemoryUris:
            coreMemoryUris.length > 0 ? coreMemoryUris : undefined,
          systemPromptOverride: useCustomPrompt
            ? systemPromptOverride.trim() || undefined
            : null,
        },
      });
      handleBack();
    } catch {
      notify({
        variant: 'error',
        title: '保存失败',
        description: '实例设置未能保存，请稍后重试。',
      });
    }
  }, [
    memoryInstanceId,
    name,
    description,
    validDomainsText,
    coreMemoryUrisText,
    useCustomPrompt,
    systemPromptOverride,
    updateMutation,
    handleBack,
    notify,
  ]);

  if (isLoading) {
    return (
      <div
        className="flex h-full flex-col gap-6 p-6"
        data-testid="memory-settings-skeleton"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-card" />
          <Skeleton className="h-4 w-40 rounded" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-card" />
        ))}
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载记忆实例失败"
          description="实例可能已被删除，或网络暂时不可用。"
          action={
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/memory' })}
            >
              返回列表
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted hover:text-foreground"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回详情
        </Button>

        <PageHeader
          icon={Settings}
          tone={MEMORY_TONE}
          title="实例设置"
          description={`调整「${instance.name}」的基本信息、知识域与系统提示词`}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleBack}>
                <X className="h-4 w-4" />
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={!name.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Spinner size="sm" className="text-current" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存
              </Button>
            </>
          }
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="settings-name"
                className="block text-sm font-medium text-foreground"
              >
                名称 <span className="text-error">*</span>
              </label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="记忆实例名称"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="settings-description"
                className="block text-sm font-medium text-foreground"
              >
                描述
              </label>
              <Textarea
                id="settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入描述（可选）"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>知识域配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="settings-valid-domains"
                className="block text-sm font-medium text-foreground"
              >
                有效域
              </label>
              <p className="text-xs text-muted">
                每行一个域名，用于限定记忆搜索范围
              </p>
              <Textarea
                id="settings-valid-domains"
                value={validDomainsText}
                onChange={(e) => setValidDomainsText(e.target.value)}
                placeholder={
                  '例如:\nproduct-knowledge\ncustomer-service\ntechnical-docs'
                }
                rows={4}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="settings-core-uris"
                className="block text-sm font-medium text-foreground"
              >
                核心记忆 URI
              </label>
              <p className="text-xs text-muted">
                每行一个 URI，指定始终加载到上下文的核心记忆节点
              </p>
              <Textarea
                id="settings-core-uris"
                value={coreMemoryUrisText}
                onChange={(e) => setCoreMemoryUrisText(e.target.value)}
                placeholder={
                  '例如:\nmemory://persona/default\nmemory://rules/safety'
                }
                rows={4}
                className="font-mono"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>系统提示词</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={useCustomPrompt ? 'custom' : 'default'}
              onValueChange={(next) => setUseCustomPrompt(next === 'custom')}
              className="flex flex-wrap items-center gap-5"
            >
              <label
                htmlFor="prompt-mode-default"
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <RadioGroupItem
                  id="prompt-mode-default"
                  value="default"
                  aria-label="使用默认模板"
                />
                使用默认模板
              </label>
              <label
                htmlFor="prompt-mode-custom"
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <RadioGroupItem
                  id="prompt-mode-custom"
                  value="custom"
                  aria-label="自定义覆盖"
                />
                自定义覆盖
              </label>
            </RadioGroup>

            {useCustomPrompt ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="settings-system-prompt"
                  className="block text-sm font-medium text-foreground"
                >
                  自定义系统提示词
                </label>
                <p className="text-xs text-muted">
                  覆盖默认的系统提示词模板。支持 {'{{memory_context}}'}{' '}
                  等变量占位符。
                </p>
                <Textarea
                  id="settings-system-prompt"
                  value={systemPromptOverride}
                  onChange={(e) => setSystemPromptOverride(e.target.value)}
                  placeholder="输入自定义系统提示词..."
                  rows={10}
                  className="font-mono"
                />
              </div>
            ) : (
              <p className="text-sm text-muted">
                将使用系统默认的记忆提示词模板。如需定制，请切换到「自定义覆盖」模式。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
