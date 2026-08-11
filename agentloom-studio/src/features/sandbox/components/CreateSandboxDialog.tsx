import { useState, type ChangeEvent } from "react";
import { Loader2 } from "lucide-react";
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
import { Slider } from "@/shared/ui/slider";
import { useCreateSandbox } from "../api/sandboxMutations";
import { useToast } from "@/shared/ui/toast";
import { normalizeSandboxConversationIdleAutoEndMinutes } from "@/shared/lib/sandboxConversationIdleAutoEnd";
import { SandboxPresetSelector } from "./SandboxPresetSelector";
import {
  useSandboxPresetStore,
  type SandboxPreset,
} from "../stores/sandboxPresetStore";

interface CreateSandboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function CreateSandboxDialog({
  open,
  onOpenChange,
}: CreateSandboxDialogProps) {
  const { notify } = useToast();
  const createMutation = useCreateSandbox();

  const [name, setName] = useState("");
  const [cpu, setCpu] = useState(1);
  const [memory, setMemory] = useState(512);
  const [disk, setDisk] = useState(2);
  const [conversationIdleAutoEndMinutes, setConversationIdleAutoEndMinutes] =
    useState(normalizeSandboxConversationIdleAutoEndMinutes(undefined));
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(
    undefined,
  );

  const addPreset = useSandboxPresetStore((s) => s.addPreset);
  const currentConfig = { cpu, memory, disk };

  function handlePresetSelect(preset: SandboxPreset) {
    setCpu(preset.cpu);
    setMemory(preset.memory);
    setDisk(preset.disk);
    setSelectedPresetId(preset.id);
  }

  function handleSaveAsPreset(preset: {
    name: string;
    cpu: number;
    memory: number;
    disk: number;
  }) {
    addPreset(preset);
  }

  function clearPresetSelection() {
    setSelectedPresetId(undefined);
  }

  function resetForm() {
    setName("");
    setCpu(1);
    setMemory(512);
    setDisk(2);
    setConversationIdleAutoEndMinutes(
      normalizeSandboxConversationIdleAutoEndMinutes(undefined),
    );
    setSelectedPresetId(undefined);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  function handleCreate() {
    if (!name.trim()) return;

    createMutation.mutate(
      {
        name: name.trim(),
        cpu,
        memory,
        disk,
        conversationIdleAutoEndMinutes,
      },
      {
        onSuccess: () => {
          notify({
            title: "已创建",
            description: `沙箱「${name.trim()}」已成功创建。`,
            variant: "success",
          });
          handleOpenChange(false);
        },
        onError: (err) => {
          notify({
            title: "创建失败",
            description: err instanceof Error ? err.message : "请稍后重试。",
            variant: "error",
          });
        },
      },
    );
  }

  const canCreate = name.trim().length > 0 && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>创建持久沙箱</DialogTitle>
          <DialogDescription>
            持久沙箱会一直保留文件系统，可跨会话复用。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <SandboxPresetSelector
            selectedPresetId={selectedPresetId}
            onSelect={handlePresetSelect}
            onSaveAsPreset={handleSaveAsPreset}
            currentConfig={currentConfig}
          />

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="sandbox-name"
            >
              名称 <span className="text-error">*</span>
            </label>
            <Input
              id="sandbox-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="沙箱名称"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="sandbox-cpu-slider"
                className="text-sm font-medium text-foreground"
              >
                CPU
              </label>
              <span className="text-sm tabular-nums text-muted">{cpu} 核</span>
            </div>
            <Slider
              id="sandbox-cpu-slider"
              min={0.5}
              max={4}
              step={0.5}
              value={[cpu]}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setCpu(clamp(Number(e.target.value), 0.5, 4));
                clearPresetSelection();
              }}
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>0.5 核</span>
              <span>4 核</span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="sandbox-memory-slider"
                className="text-sm font-medium text-foreground"
              >
                Memory
              </label>
              <span className="text-sm tabular-nums text-muted">
                {memory} MB
              </span>
            </div>
            <Slider
              id="sandbox-memory-slider"
              min={256}
              max={4096}
              step={256}
              value={[memory]}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setMemory(clamp(Number(e.target.value), 256, 4096));
                clearPresetSelection();
              }}
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>256 MB</span>
              <span>4096 MB</span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="sandbox-disk-slider"
                className="text-sm font-medium text-foreground"
              >
                Disk
              </label>
              <span className="text-sm tabular-nums text-muted">{disk} GB</span>
            </div>
            <Slider
              id="sandbox-disk-slider"
              min={1}
              max={10}
              step={1}
              value={[disk]}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setDisk(clamp(Number(e.target.value), 1, 10));
                clearPresetSelection();
              }}
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>1 GB</span>
              <span>10 GB</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="sandbox-conversation-idle-auto-end-minutes"
            >
              对话空闲自动结束（分钟）
            </label>
            <Input
              id="sandbox-conversation-idle-auto-end-minutes"
              type="number"
              min={1}
              max={1440}
              value={conversationIdleAutoEndMinutes}
              onChange={(e) =>
                setConversationIdleAutoEndMinutes(
                  normalizeSandboxConversationIdleAutoEndMinutes(
                    Number(e.target.value),
                  ),
                )
              }
            />
            <p className="text-xs leading-5 text-muted">
              沙箱里没有运行中的对话，且所有对话都空闲后，会按该分钟数自动结束对话。
            </p>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={!canCreate} onClick={handleCreate}>
            {createMutation.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
