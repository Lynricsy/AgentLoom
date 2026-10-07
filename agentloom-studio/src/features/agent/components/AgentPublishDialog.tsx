import { memo, useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Upload } from "lucide-react";

import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Textarea } from "@/shared/ui/textarea";

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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" data-testid="publish-agent-sheet">
        <SheetHeader>
          <SheetTitle>发布 Agent</SheetTitle>
          <SheetDescription>
            发布后 Agent 将以当前发布版本对外提供能力
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="publish-label" className="text-sm font-medium">
                发布标签{" "}
                <span className="text-muted-foreground">（可选）</span>
              </label>
              <Input
                id="publish-label"
                type="text"
                maxLength={255}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="例如：正式发布"
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
              <Textarea
                id="publish-release-notes"
                value={releaseNotes}
                onChange={(event) => setReleaseNotes(event.target.value)}
                placeholder="例如：补齐 Agent 顶部工具栏与版本历史"
                rows={4}
                data-testid="publish-release-notes-input"
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">发布来源</p>

              <RadioGroup
                name="version-source"
                value={versionSource}
                onValueChange={(value) =>
                  setVersionSource(value as "current" | "existing")
                }
                className="gap-3"
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors duration-150 hover:bg-muted">
                  <RadioGroupItem
                    value="current"
                    className="mt-0.5"
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

                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors duration-150 hover:bg-muted">
                  <RadioGroupItem
                    value="existing"
                    className="mt-0.5"
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
              </RadioGroup>

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
                  <AlertCircle className="size-4" />
                  <span>发布失败</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-error">
                  {validationErrors.map((message) => (
                    <li key={message} data-testid="publish-validation-error-item">
                      {message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SheetBody>

          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline" data-testid="cancel-publish">
                取消
              </Button>
            </SheetClose>
            <Button
              type="submit"
              disabled={publishMutation.isPending || isCanvasSaving}
              data-testid="confirm-publish"
            >
              {publishMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              发布
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
});
