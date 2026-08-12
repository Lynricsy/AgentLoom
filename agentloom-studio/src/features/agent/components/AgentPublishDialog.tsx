import { memo, useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Loader2, Upload, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { useToast } from "@/shared/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

import { usePublishAgent } from "../api/agentMutations";
import { useAgentVersions } from "../api/agentQueries";
import type { AgentVersion } from "../types";

interface AgentPublishDialogProps {
  open: boolean;
  agentId: string;
  initialVersionId?: string | null;
  onOpenChange: (open: boolean) => void;
  onBeforePublishCurrentVersion?: () => Promise<boolean> | boolean;
  isCanvasSaving?: boolean;
}

interface PublishErrorPayload {
  detail?: unknown;
  errors?: Array<{
    message?: unknown;
  }>;
}

async function extractPublishErrorMessages(error: unknown): Promise<string[]> {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: unknown }).response;
    if (typeof Response !== "undefined" && response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as PublishErrorPayload;
        const messages = (payload.errors ?? [])
          .map((item) =>
            typeof item.message === "string" ? item.message.trim() : "",
          )
          .filter(Boolean);

        if (messages.length > 0) {
          return messages;
        }

        if (typeof payload.detail === "string" && payload.detail.trim()) {
          return [payload.detail.trim()];
        }
      } catch {}
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return [error.message.trim()];
  }

  return ["发布失败，请稍后重试"];
}

function formatPublishableRecordLabel(version: AgentVersion): string {
  return `v${version.versionNumber}${version.label ? ` - ${version.label}` : ""}`;
}

export const AgentPublishDialog = memo(function AgentPublishDialog({
  open,
  agentId,
  initialVersionId,
  onOpenChange,
  onBeforePublishCurrentVersion,
  isCanvasSaving = false,
}: AgentPublishDialogProps) {
  const [label, setLabel] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [versionSource, setVersionSource] = useState<"current" | "existing">(
    "current",
  );
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const publishMutation = usePublishAgent(agentId);
  const { data: versionsData } = useAgentVersions(agentId, {
    page: 1,
    pageSize: 50,
  });
  const { notify } = useToast();

  const publishableVersions = (versionsData?.data ?? []).filter(
    (version) => !version.publishedAt && !version.archivedAt,
  );

  const resetForm = useCallback(
    (nextVersionId: string | null = initialVersionId ?? null) => {
      setLabel("");
      setReleaseNotes("");
      setVersionSource(nextVersionId ? "existing" : "current");
      setSelectedVersionId(nextVersionId ?? "");
      setValidationErrors([]);
    },
    [initialVersionId],
  );

  useEffect(() => {
    if (open) {
      resetForm(initialVersionId ?? null);
    }
  }, [initialVersionId, open, resetForm]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setValidationErrors([]);

      if (versionSource === "existing" && !selectedVersionId) {
        setValidationErrors(["请选择一条可发布记录"]);
        return;
      }

      if (versionSource === "current" && onBeforePublishCurrentVersion) {
        const canContinue = await onBeforePublishCurrentVersion();
        if (!canContinue) {
          return;
        }
      }

      try {
        await publishMutation.mutateAsync({
          label: label.trim() || undefined,
          releaseNotes: releaseNotes.trim() || undefined,
          versionId:
            versionSource === "existing" ? selectedVersionId : undefined,
        });

        notify({
          title: "发布成功",
          description: "Agent 已发布",
          variant: "success",
        });
        resetForm();
        onOpenChange(false);
      } catch (error) {
        setValidationErrors(await extractPublishErrorMessages(error));
      }
    },
    [
      label,
      notify,
      onBeforePublishCurrentVersion,
      onOpenChange,
      publishMutation,
      releaseNotes,
      resetForm,
      selectedVersionId,
      versionSource,
    ],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetForm();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetForm],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col",
            "border-l border-border bg-surface shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
          data-testid="publish-agent-sheet"
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Dialog.Title className="text-base font-medium">
                发布 Agent
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                发布后 Agent 将以当前发布版本对外提供能力
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                <label htmlFor="publish-label" className="text-sm font-medium">
                  发布标签{" "}
                  <span className="text-muted-foreground">（可选）</span>
                </label>
                <input
                  id="publish-label"
                  type="text"
                  maxLength={255}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="例如：正式发布"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="publish-label-input"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="publish-release-notes"
                  className="text-sm font-medium"
                >
                  发布说明{" "}
                  <span className="text-muted-foreground">（可选）</span>
                </label>
                <textarea
                  id="publish-release-notes"
                  value={releaseNotes}
                  onChange={(event) => setReleaseNotes(event.target.value)}
                  placeholder="例如：补齐 Agent 顶部工具栏与版本历史"
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="publish-release-notes-input"
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">发布来源</p>

                <label className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-surface-elevated">
                  <input
                    type="radio"
                    name="version-source"
                    checked={versionSource === "current"}
                    onChange={() => setVersionSource("current")}
                    data-testid="source-current"
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      当前编辑稿
                    </div>
                    <div className="text-xs text-muted-foreground">
                      使用当前 Agent 画布状态创建一个新的发布版本
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-surface-elevated">
                  <input
                    type="radio"
                    name="version-source"
                    checked={versionSource === "existing"}
                    onChange={() => setVersionSource("existing")}
                    data-testid="source-existing"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      选择已有记录
                    </div>
                    <div className="text-xs text-muted-foreground">
                      直接发布某个已保存的历史版本
                    </div>
                  </div>
                </label>

                {versionSource === "existing" && (
                  <div className="space-y-2">
                    <label
                      htmlFor="agent-version-select"
                      className="text-sm font-medium"
                    >
                      可发布记录
                    </label>
                    <Select
                      value={selectedVersionId}
                      onValueChange={setSelectedVersionId}
                    >
                      <SelectTrigger
                        id="agent-version-select"
                        aria-label="可发布记录"
                        data-testid="version-select"
                      >
                        <SelectValue placeholder="请选择一条记录" />
                      </SelectTrigger>
                      <SelectContent>
                        {publishableVersions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            {formatPublishableRecordLabel(version)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {publishableVersions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        当前没有可直接发布的历史记录
                      </p>
                    )}
                  </div>
                )}
              </div>

              {validationErrors.length > 0 && (
                <div
                  className="rounded-md border border-error/30 bg-error/10 p-3"
                  data-testid="publish-validation-error"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-error">
                    <AlertCircle className="h-4 w-4" />
                    <span>发布失败</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-error">
                    {validationErrors.map((message) => (
                      <li
                        key={message}
                        data-testid="publish-validation-error-item"
                      >
                        {message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
                  data-testid="cancel-publish"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={publishMutation.isPending || isCanvasSaving}
                data-testid="confirm-publish"
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                发布
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
