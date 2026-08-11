import { memo, useCallback, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useToast } from "@/shared/ui/toast";

import { useCreateAgentVersion } from "../api/agentMutations";

interface AgentCreateVersionDialogProps {
  open: boolean;
  agentId: string;
  onOpenChange: (open: boolean) => void;
  onBeforeCreateVersion?: () => Promise<boolean> | boolean;
  isCanvasSaving?: boolean;
}

export const AgentCreateVersionDialog = memo(function AgentCreateVersionDialog({
  open,
  agentId,
  onOpenChange,
  onBeforeCreateVersion,
  isCanvasSaving = false,
}: AgentCreateVersionDialogProps) {
  const [label, setLabel] = useState("");
  const createVersionMutation = useCreateAgentVersion(agentId);
  const { notify } = useToast();

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (onBeforeCreateVersion) {
        const canContinue = await onBeforeCreateVersion();
        if (!canContinue) {
          return;
        }
      }

      try {
        await createVersionMutation.mutateAsync({
          label: label.trim() || undefined,
        });
        notify({
          title: "版本已保存",
          description: label.trim()
            ? `版本「${label.trim()}」已创建`
            : "新版本已创建",
          variant: "success",
        });
        setLabel("");
        onOpenChange(false);
      } catch {
        notify({
          title: "保存版本失败",
          description: "请稍后重试",
          variant: "error",
        });
      }
    },
    [createVersionMutation, label, notify, onBeforeCreateVersion, onOpenChange],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setLabel("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" data-testid="create-agent-version-dialog">
        <DialogHeader>
          <DialogTitle>保存版本</DialogTitle>
          <DialogDescription>
            创建当前 Agent 画布的版本快照，便于后续发布或回看历史。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-1.5">
            <label htmlFor="agent-version-label">
              <Label>
                版本标签 <span className="text-muted">（可选）</span>
              </Label>
            </label>
            <Input
              id="agent-version-label"
              type="text"
              maxLength={255}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="例如：补齐顶部工具栏"
              data-testid="agent-version-label-input"
            />
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                data-testid="cancel-create-agent-version"
              >
                取消
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={createVersionMutation.isPending || isCanvasSaving}
              data-testid="confirm-create-agent-version"
            >
              {createVersionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存版本
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});
