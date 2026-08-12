import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  Loader2,
  Plus,
  RotateCcw,
  Server,
  Sparkles,
} from "lucide-react";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useToast } from "@/shared/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { cn } from "@/shared/lib/utils";
import type {
  ConnectionTestResult,
  DiscoveredModel,
  LlmModelInfo,
  LlmProviderEntity,
} from "../../types";
import {
  useDeleteLlmModel,
  useDiscoverModels,
  useResetProviderBaseUrl,
  useTestProviderConnection,
  useUpdateLlmModel,
  useUpdateProvider,
} from "../../hooks/useLlmModels";
import { ManagedApiKeyField } from "../ManagedApiKeyField";
import { ProviderIcon } from "../ProviderIcon";
import { buildProviderCredentialInput } from "../providerCredentialUtils";
import { PROTOCOL_LABELS, ModelMetaChip } from "./modelMeta";
import { ModelRow } from "./ModelRow";
import { AddModelForm } from "./AddModelForm";
import { EditModelForm } from "./EditModelForm";

interface ProviderConfigPanelProps {
  provider: LlmProviderEntity;
  models: LlmModelInfo[];
}

export function ProviderConfigPanel({ provider, models }: ProviderConfigPanelProps) {
  const { notify } = useToast();
  const updateProviderMutation = useUpdateProvider();
  const resetBaseUrlMutation = useResetProviderBaseUrl();
  const testConnectionMutation = useTestProviderConnection();
  const discoverMutation = useDiscoverModels();
  const deleteMutation = useDeleteLlmModel();
  const updateModelMutation = useUpdateLlmModel();

  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [connectionResult, setConnectionResult] =
    useState<ConnectionTestResult | null>(null);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModel, setEditingModel] = useState<LlmModelInfo | null>(null);
  const [deleteConfirmModel, setDeleteConfirmModel] =
    useState<LlmModelInfo | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
    [],
  );

  // Base URL 是否不同于默认
  const baseUrlDiffers =
    provider.defaultBaseUrl != null &&
    provider.baseUrl !== provider.defaultBaseUrl;

  // --- 事件处理 ---

  const handleBaseUrlSave = useCallback(async () => {
    try {
      await updateProviderMutation.mutateAsync({
        id: provider.id,
        input: { baseUrl: baseUrl.trim() || undefined },
      });
      notify({ description: "Base URL 已更新", variant: "success" });
    } catch (err) {
      notify({
        title: "更新失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [updateProviderMutation, provider.id, baseUrl, notify]);

  const handleResetBaseUrl = useCallback(async () => {
    try {
      await resetBaseUrlMutation.mutateAsync(provider.id);
      setBaseUrl(provider.defaultBaseUrl ?? "");
      notify({ description: "Base URL 已恢复默认", variant: "success" });
    } catch (err) {
      notify({
        title: "恢复失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [resetBaseUrlMutation, provider.id, provider.defaultBaseUrl, notify]);

  const handleApiKeySave = useCallback(async () => {
    const input = buildProviderCredentialInput({
      provider,
      apiKey,
      clearApiKey,
    });

    if (!input) {
      notify({ description: "没有可保存的 API Key 变更", variant: "error" });
      return;
    }

    try {
      await updateProviderMutation.mutateAsync({
        id: provider.id,
        input,
      });
      setApiKey("");
      setClearApiKey(false);
      notify({ description: "API Key 已更新", variant: "success" });
    } catch (err) {
      notify({
        title: "更新失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [apiKey, clearApiKey, notify, provider, updateProviderMutation]);

  const handleTestConnection = useCallback(async () => {
    setConnectionResult(null);
    try {
      const result = await testConnectionMutation.mutateAsync({
        id: provider.id,
      });
      setConnectionResult(result);
      if (result.success) {
        notify({
          title: "连接成功",
          description: `延迟 ${result.latencyMs}ms`,
          variant: "success",
        });
      } else {
        notify({
          title: "连接失败",
          description: "无法连接到提供商端点",
          variant: "error",
        });
      }
    } catch (err) {
      notify({
        title: "测试失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [testConnectionMutation, provider.id, notify]);

  const handleDiscoverModels = useCallback(async () => {
    try {
      const result = await discoverMutation.mutateAsync(provider.id);
      setDiscoveredModels(result);
      notify({
        title: "发现完成",
        description: `发现 ${result.length} 个可用模型`,
        variant: "success",
      });
    } catch (err) {
      notify({
        title: "发现失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [discoverMutation, provider.id, notify]);

  const handleToggleModelEnabled = useCallback(
    async (model: LlmModelInfo) => {
      try {
        await updateModelMutation.mutateAsync({
          id: model.id,
          payload: { isEnabled: !model.isEnabled },
        });
      } catch (err) {
        notify({
          title: "更新失败",
          description: err instanceof Error ? err.message : "请稍后重试",
          variant: "error",
        });
      }
    },
    [updateModelMutation, notify],
  );

  const handleConfirmDeleteModel = useCallback(async () => {
    if (!deleteConfirmModel) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirmModel.id);
      notify({
        title: "已删除",
        description: `已删除模型「${deleteConfirmModel.name}」`,
        variant: "success",
      });
      setDeleteConfirmModel(null);
    } catch (err) {
      notify({
        title: "删除失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [deleteConfirmModel, deleteMutation, notify]);

  // 当 provider 切换时重置本地状态
  useEffect(() => {
    setBaseUrl(provider.baseUrl ?? "");
    setApiKey("");
    setClearApiKey(false);
    setConnectionResult(null);
    setShowAddModel(false);
    setEditingModel(null);
    setDeleteConfirmModel(null);
    setDiscoveredModels([]);
  }, [provider.id]);

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {/* 头部 */}
        <div className="flex items-start gap-3">
          <ProviderIcon
            slug={provider.slug}
            iconUrl={provider.iconUrl}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-lg font-semibold text-foreground">
                {provider.name}
              </h2>
              <ModelMetaChip compact>
                {PROTOCOL_LABELS[provider.apiProtocol] ?? provider.apiProtocol}
              </ModelMetaChip>
              {provider.isBuiltin && (
                <ModelMetaChip tone="primary" compact>
                  内置
                </ModelMetaChip>
              )}
              {!provider.isEnabled && (
                <Badge size="sm" variant="warning">
                  已禁用
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted">{provider.slug}</p>
          </div>
        </div>

        {/* Base URL */}
        <Card className="space-y-2 p-4">
          <Label>Base URL</Label>
          <div className="flex gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider.defaultBaseUrl ?? "输入 API 端点 URL"}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleBaseUrlSave()}
              disabled={updateProviderMutation.isPending}
              className="shrink-0"
            >
              {updateProviderMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "保存"
              )}
            </Button>
            {baseUrlDiffers && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleResetBaseUrl()}
                disabled={resetBaseUrlMutation.isPending}
                className="shrink-0"
                title="恢复默认 URL"
              >
                {resetBaseUrlMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
          {provider.defaultBaseUrl && (
            <p className="text-[11px] text-muted">
              默认: {provider.defaultBaseUrl}
            </p>
          )}
        </Card>

        {/* API Key */}
        <Card className="space-y-2 p-4">
          <Label>API Key</Label>
          <ManagedApiKeyField
            value={apiKey}
            onValueChange={(next) => {
              setApiKey(next);
              if (next.trim().length > 0) {
                setClearApiKey(false);
              }
            }}
            hasStoredApiKey={Boolean(provider.apiKeyId)}
            clearRequested={clearApiKey}
            onClearRequestedChange={setClearApiKey}
            helperText="输入后会由服务端加密托管；这里修改的是 Provider 级凭据，会影响该 Provider 下的所有模型。"
            inputTestId="provider-config-api-key-input"
          />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleApiKeySave()}
              disabled={
                updateProviderMutation.isPending ||
                (apiKey.trim().length === 0 &&
                  (!clearApiKey || provider.apiKeyId == null))
              }
            >
              {updateProviderMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "保存凭据"
              )}
            </Button>
          </div>
        </Card>

        {/* 连接测试 */}
        <Card className="space-y-2 p-4">
          <Label>连接测试</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTestConnection()}
              disabled={testConnectionMutation.isPending}
            >
              {testConnectionMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="mr-1.5 h-3.5 w-3.5" />
              )}
              测试连接
            </Button>
            {connectionResult && (
              <span
                className={cn(
                  "text-xs",
                  connectionResult.success ? "text-success" : "text-error",
                )}
              >
                {connectionResult.success
                  ? `连接成功 (${connectionResult.latencyMs}ms)`
                  : "连接失败"}
                {connectionResult.serverInfo?.version &&
                  ` - v${connectionResult.serverInfo.version}`}
              </span>
            )}
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              模型配置 ({models.length})
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDiscoverModels()}
                disabled={discoverMutation.isPending}
              >
                {discoverMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                发现模型
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setShowAddModel(true);
                  setEditingModel(null);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                添加模型
              </Button>
            </div>
          </div>

          {/* 添加模型表单 */}
          {showAddModel && (
            <AddModelForm
              providerId={provider.id}
              providerSlug={provider.slug}
              discoveredModels={discoveredModels}
              onClose={() => setShowAddModel(false)}
            />
          )}

          {/* 编辑模型表单 */}
          {editingModel && (
            <EditModelForm
              key={editingModel.id}
              model={editingModel}
              onClose={() => setEditingModel(null)}
            />
          )}

          {/* 模型行列表 */}
          {models.length === 0 && !showAddModel ? (
            <EmptyState
              icon={Server}
              tone="var(--color-type-model)"
              title="该提供商下暂无模型配置"
              description="点击「发现模型」自动获取，或手动「添加模型」。"
            />
          ) : (
            <div className="space-y-2">
              {models.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  onEdit={(m) => {
                    setEditingModel(m);
                    setShowAddModel(false);
                  }}
                  onDelete={(m) => setDeleteConfirmModel(m)}
                  onToggleEnabled={(m) => void handleToggleModelEnabled(m)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 删除模型确认对话框 */}
      <AlertDialog
        open={deleteConfirmModel !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmModel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除模型「{deleteConfirmModel?.name}」吗？此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={() => void handleConfirmDeleteModel()}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
