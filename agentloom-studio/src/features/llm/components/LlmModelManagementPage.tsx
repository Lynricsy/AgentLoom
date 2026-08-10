import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Server, Zap } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import type { LlmProviderEntity } from "../types";
import {
  useDeleteProvider,
  useLlmModels,
  useLlmProviders,
  useUpdateProvider,
} from "../hooks/useLlmModels";
import { ProviderListPanel } from "./model-management/ProviderListPanel";
import { ProviderConfigPanel } from "./model-management/ProviderConfigPanel";
import { CreateProviderDialog } from "./model-management/CreateProviderDialog";

export function LlmModelManagementPage() {
  const { notify } = useToast();
  const providersQuery = useLlmProviders();
  const modelsQuery = useLlmModels();
  const updateProviderMutation = useUpdateProvider();
  const deleteProviderMutation = useDeleteProvider();

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirmProvider, setDeleteConfirmProvider] =
    useState<LlmProviderEntity | null>(null);

  const providers = useMemo(
    () => providersQuery.data ?? [],
    [providersQuery.data],
  );
  const allModels = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);

  // 自动选中第一个 provider
  useEffect(() => {
    if (selectedProviderId == null && providers.length > 0 && providers[0]) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers.length]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const selectedProviderModels = useMemo(
    () =>
      selectedProvider
        ? allModels.filter((m) => m.providerId === selectedProvider.id)
        : [],
    [allModels, selectedProvider],
  );

  // --- Provider 操作 ---

  const handleToggleProviderEnabled = useCallback(
    async (provider: LlmProviderEntity) => {
      try {
        await updateProviderMutation.mutateAsync({
          id: provider.id,
          input: { isEnabled: !provider.isEnabled },
        });
      } catch (err) {
        notify({
          title: "更新失败",
          description: err instanceof Error ? err.message : "请稍后重试",
          variant: "error",
        });
      }
    },
    [updateProviderMutation, notify],
  );

  const handleConfirmDeleteProvider = useCallback(async () => {
    if (!deleteConfirmProvider) return;
    try {
      await deleteProviderMutation.mutateAsync(deleteConfirmProvider.id);
      notify({
        title: "已删除",
        description: `已删除提供商「${deleteConfirmProvider.name}」`,
        variant: "success",
      });
      setDeleteConfirmProvider(null);
      // 如果删除的是当前选中的，则清除选中
      if (selectedProviderId === deleteConfirmProvider.id) {
        setSelectedProviderId(
          providers.length > 1
            ? (providers.find((p) => p.id !== deleteConfirmProvider.id)?.id ??
                null)
            : null,
        );
      }
    } catch (err) {
      notify({
        title: "删除失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [
    deleteConfirmProvider,
    deleteProviderMutation,
    notify,
    selectedProviderId,
    providers,
  ]);

  // 全局 loading 态
  const isLoading = providersQuery.isLoading || modelsQuery.isLoading;

  return (
    <div className="flex h-full flex-col">
      {/* 页头 */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold text-foreground">LLM 提供商</h1>
          <p className="text-sm text-muted-foreground">
            管理 AI 模型提供商和模型配置
          </p>
        </div>
      </div>

      {/* 主体: 左右布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧: Provider 列表 */}
        <ProviderListPanel
          providers={providers}
          isLoading={isLoading}
          selectedId={selectedProviderId}
          onSelect={setSelectedProviderId}
          onToggleEnabled={(p) => void handleToggleProviderEnabled(p)}
          onDelete={setDeleteConfirmProvider}
          onAdd={() => setShowCreateDialog(true)}
        />

        {/* 右侧: Provider 配置 */}
        {selectedProvider ? (
          <ProviderConfigPanel
            key={selectedProvider.id}
            provider={selectedProvider}
            models={selectedProviderModels}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48 rounded" />
                <Skeleton className="h-4 w-64 rounded" />
              </div>
            ) : providers.length === 0 ? (
              <>
                <Zap className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  暂无提供商
                </p>
                <p className="text-sm text-muted-foreground">
                  添加自定义提供商或等待内置提供商同步
                </p>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  添加自定义提供商
                </Button>
              </>
            ) : (
              <>
                <Server className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  从左侧选择一个提供商查看配置
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* 创建 Provider 对话框 */}
      <CreateProviderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* 删除 Provider 确认对话框 */}
      <AlertDialog
        open={deleteConfirmProvider !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmProvider(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除提供商</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除提供商「{deleteConfirmProvider?.name}
            」吗？该提供商下的所有模型配置也将被删除，此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteProviderMutation.isPending}
              onClick={() => void handleConfirmDeleteProvider()}
            >
              {deleteProviderMutation.isPending && (
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
