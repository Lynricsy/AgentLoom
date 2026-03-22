import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Loader2, Save, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  useMemoryInstance,
  useUpdateMemoryInstance,
} from '../hooks/useMemoryInstances';

interface MemoryInstanceSettingsPageProps {
  memoryInstanceId: string;
}

export function MemoryInstanceSettingsPage({
  memoryInstanceId,
}: MemoryInstanceSettingsPageProps) {
  const navigate = useNavigate();
  const { data: instance, isLoading, isError } = useMemoryInstance(memoryInstanceId);
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
      // 错误已由 mutation 状态管理
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
  ]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">加载记忆实例失败</p>
        <Button variant="outline" onClick={() => void navigate({ to: '/memory' })}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6 gap-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回详情
          </Button>
          <h1 className="text-xl font-bold">实例设置</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <X className="mr-1 h-4 w-4" />
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!name.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            保存
          </Button>
        </div>
      </div>

      {updateMutation.isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          保存失败，请重试
        </div>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto">
        {/* 基本信息 */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">基本信息</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="settings-name"
                className="mb-1.5 block text-sm font-medium"
              >
                名称 <span className="text-destructive">*</span>
              </label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="记忆实例名称"
              />
            </div>
            <div>
              <label
                htmlFor="settings-description"
                className="mb-1.5 block text-sm font-medium"
              >
                描述
              </label>
              <textarea
                id="settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入描述（可选）"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </section>

        {/* 知识域配置 */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">知识域配置</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="settings-valid-domains"
                className="mb-1.5 block text-sm font-medium"
              >
                有效域
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                每行一个域名，用于限定记忆搜索范围
              </p>
              <textarea
                id="settings-valid-domains"
                value={validDomainsText}
                onChange={(e) => setValidDomainsText(e.target.value)}
                placeholder={"例如:\nproduct-knowledge\ncustomer-service\ntechnical-docs"}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="settings-core-uris"
                className="mb-1.5 block text-sm font-medium"
              >
                核心记忆 URI
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                每行一个 URI，指定始终加载到上下文的核心记忆节点
              </p>
              <textarea
                id="settings-core-uris"
                value={coreMemoryUrisText}
                onChange={(e) => setCoreMemoryUrisText(e.target.value)}
                placeholder={"例如:\nmemory://persona/default\nmemory://rules/safety"}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </section>

        {/* 系统提示词 */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">系统提示词</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="prompt-mode"
                  checked={!useCustomPrompt}
                  onChange={() => setUseCustomPrompt(false)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">使用默认模板</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="prompt-mode"
                  checked={useCustomPrompt}
                  onChange={() => setUseCustomPrompt(true)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">自定义覆盖</span>
              </label>
            </div>

            {useCustomPrompt && (
              <div>
                <label
                  htmlFor="settings-system-prompt"
                  className="mb-1.5 block text-sm font-medium"
                >
                  自定义系统提示词
                </label>
                <p className="mb-2 text-xs text-muted-foreground">
                  覆盖默认的系统提示词模板。支持 {'{{memory_context}}'} 等变量占位符。
                </p>
                <textarea
                  id="settings-system-prompt"
                  value={systemPromptOverride}
                  onChange={(e) => setSystemPromptOverride(e.target.value)}
                  placeholder="输入自定义系统提示词..."
                  rows={10}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {!useCustomPrompt && (
              <p className="text-sm text-muted-foreground">
                将使用系统默认的记忆提示词模板。如需定制，请切换到「自定义覆盖」模式。
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
