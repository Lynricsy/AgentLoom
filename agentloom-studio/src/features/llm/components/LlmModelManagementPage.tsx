import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Cpu, Loader2, Plus, Server } from "lucide-react";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
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

  const isError = providersQuery.isError || modelsQuery.isError;

  useEffect(() => {
    if (!isError) return;
    notify({
      title: "提供商列表加载失败",
      description: "请检查网络后重试。",
      variant: "error",
    });
  }, [isError, notify]);

  const handleRetry = useCallback(() => {
    void providersQuery.refetch();
    void modelsQuery.refetch();
  }, [modelsQuery, providersQuery]);

  // 全局 loading 态
  const isLoading = providersQuery.isLoading || modelsQuery.isLoading;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        className="border-b border-border px-4 py-4 sm:px-6"
        icon={Cpu}
        tone="var(--color-type-model)"
        title="LLM 提供商"
        description="管理 AI 模型提供商和模型配置"
        actions={
          <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            添加自定义提供商
          </Button>
        }
      />

      {isError ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={AlertCircle}
            tone="var(--color-error)"
            title="提供商列表加载失败"
            description="请稍后重试，或检查后端服务是否可用。"
            action={
              <Button variant="outline" onClick={handleRetry}>
                重新加载
              </Button>
            }
          />
        </div>
      ) : (
        /* 主体: <lg 上下堆叠，lg 起左右分栏 */
        <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden lg:flex-row lg:overflow-hidden">
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
            <div className="flex min-w-0 flex-1 items-center justify-center px-6 py-12">
              {isLoading ? (
                <div
                  className="w-full max-w-3xl space-y-3"
                  data-testid="llm-provider-config-skeleton"
                >
                  <Skeleton className="h-9 w-56 rounded-card" />
                  <Skeleton className="h-10 w-full rounded-card" />
                  <Skeleton className="h-10 w-full rounded-card" />
                  <Skeleton className="h-24 w-full rounded-card" />
                </div>
              ) : providers.length === 0 ? (
                <EmptyState
                  icon={Cpu}
                  tone="var(--color-type-model)"
                  title="暂无提供商"
                  description="添加自定义提供商，或等待内置提供商同步完成。"
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreateDialog(true)}
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      添加自定义提供商
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Server}
                  tone="var(--color-type-model)"
                  title="尚未选择提供商"
                  description="从左侧列表挑一个提供商，查看它的 Base URL、凭据与模型配置。"
                />
              )}
            </div>
          )}
        </div>
      )}

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
              className="bg-error text-white hover:bg-error/90"
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
