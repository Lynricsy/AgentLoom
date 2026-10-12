import { memo, useCallback, type ChangeEvent } from "react";
import { Container } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Slider } from "@/shared/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { FormField } from "@/shared/components/form-field/FormField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { usePersistentSandboxes } from "@/features/sandbox";
import type { SandboxSession } from "@/features/sandbox";
import { SandboxPresetSelector } from "@/features/sandbox";
import {
  useSandboxPresetStore,
  getAllPresets,
  findMatchingPreset,
  type SandboxPreset,
} from "@/features/sandbox";

interface SandboxConfigPanelProps {
  config: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
}

type LifecycleMode = "session" | "persistent";

interface SandboxConfig {
  cpu: number;
  memory: number;
  disk: number;
  persistencePath: string;
  timeout: number;
  lifecycleMode: LifecycleMode;
  persistentSandboxId: string;
  persistentSandboxName: string;
}

function parseSandboxConfig(config: Record<string, unknown>): SandboxConfig {
  return {
    cpu: typeof config.cpu === "number" ? config.cpu : 1,
    memory: typeof config.memory === "number" ? config.memory : 512,
    disk: typeof config.disk === "number" ? config.disk : 2,
    persistencePath:
      typeof config.persistencePath === "string" ? config.persistencePath : "",
    timeout: typeof config.timeout === "number" ? config.timeout : 0,
    lifecycleMode:
      config.lifecycleMode === "persistent" ? "persistent" : "session",
    persistentSandboxId:
      typeof config.persistentSandboxId === "string"
        ? config.persistentSandboxId
        : "",
    persistentSandboxName:
      typeof config.persistentSandboxName === "string"
        ? config.persistentSandboxName
        : "",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNumericValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSandboxTimeoutHours(timeout: number): string {
  return timeout > 0 ? `${timeout} 小时` : "不超时";
}

const SELECTABLE_STATUSES = new Set(["ready", "stopped"]);

function PersistentSandboxSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (session: SandboxSession | null) => void;
}) {
  const { data: sandboxes, isLoading, isError } = usePersistentSandboxes();

  const available = (sandboxes ?? []).filter((s) =>
    SELECTABLE_STATUSES.has(s.status),
  );

  if (isLoading) {
    return (
      <div role="status">
        <Skeleton className="h-9 w-full" />
        <span className="sr-only">加载持久沙箱…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-2 text-xs font-medium text-error">
        持久沙箱列表加载失败，请稍后重试。
      </p>
    );
  }

  if (available.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        暂无可用的持久沙箱。请先在沙箱管理页面创建。
      </p>
    );
  }

  return (
    <Select
      value={selectedId}
      onValueChange={(value) => {
        onSelect(available.find((s) => s.id === value) ?? null);
      }}
    >
      <SelectTrigger id="sandbox-persistent-select" aria-label="选择持久沙箱">
        <SelectValue placeholder="请选择持久沙箱" />
      </SelectTrigger>
      <SelectContent>
        {available.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.config.name || s.id.slice(0, 8)} (
            {s.status === "ready" ? "就绪" : "已停止"})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const SandboxConfigPanel = memo(function SandboxConfigPanel({
  config,
  onApply,
}: SandboxConfigPanelProps) {
  const sandbox = parseSandboxConfig(config);

  const applyPatch = useCallback(
    (patch: Partial<SandboxConfig>) => {
      const next = { ...parseSandboxConfig(config), ...patch };
      onApply({ config: next });
    },
    [config, onApply],
  );

  const applyField = useCallback(
    (field: keyof SandboxConfig, value: string | number) => {
      applyPatch({ [field]: value });
    },
    [applyPatch],
  );

  const handleLifecycleMode = useCallback(
    (mode: string) => {
      applyPatch({ lifecycleMode: mode as LifecycleMode });
    },
    [applyPatch],
  );

  const handleSelectPersistentSandbox = useCallback(
    (session: SandboxSession | null) => {
      applyPatch({
        persistentSandboxId: session?.id ?? "",
        persistentSandboxName: session?.config.name ?? "",
      });
    },
    [applyPatch],
  );

  const customPresets = useSandboxPresetStore((s) => s.customPresets);
  const addPreset = useSandboxPresetStore((s) => s.addPreset);
  const allPresets = getAllPresets(customPresets);
  const currentSessionConfig = {
    cpu: sandbox.cpu,
    memory: sandbox.memory,
    disk: sandbox.disk,
  };
  const matchedPreset = findMatchingPreset(allPresets, currentSessionConfig);

  const handlePresetSelect = useCallback(
    (preset: SandboxPreset) => {
      applyPatch({ cpu: preset.cpu, memory: preset.memory, disk: preset.disk });
    },
    [applyPatch],
  );

  const handleSaveAsPreset = useCallback(
    (preset: { name: string; cpu: number; memory: number; disk: number }) => {
      addPreset(preset);
    },
    [addPreset],
  );

  const handleCpu = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyField(
        "cpu",
        clamp(parseNumericValue(e.target.value, sandbox.cpu), 0.5, 4),
      );
    },
    [applyField, sandbox.cpu],
  );

  const handleMemory = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyField(
        "memory",
        clamp(parseNumericValue(e.target.value, sandbox.memory), 256, 4096),
      );
    },
    [applyField, sandbox.memory],
  );

  const handleDisk = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyField(
        "disk",
        clamp(parseNumericValue(e.target.value, sandbox.disk), 1, 10),
      );
    },
    [applyField, sandbox.disk],
  );

  const handleTimeout = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyField(
        "timeout",
        clamp(parseNumericValue(e.target.value, sandbox.timeout), 0, 168),
      );
    },
    [applyField, sandbox.timeout],
  );

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="flex items-center gap-2">
        <Container className="h-4 w-4 text-type-tool" />
        <Badge tone="var(--color-type-tool)">Sandbox</Badge>
      </div>

      {/* Lifecycle mode toggle */}
      <div className="flex flex-col gap-1.5">
        <span id="sandbox-lifecycle-label" className="text-xs font-medium text-foreground">
          生命周期模式
        </span>
        <Tabs
          value={sandbox.lifecycleMode}
          defaultValue="session"
          onValueChange={handleLifecycleMode}
        >
          <TabsList
            aria-labelledby="sandbox-lifecycle-label"
            className="grid grid-cols-2"
          >
            <TabsTrigger value="session">临时</TabsTrigger>
            <TabsTrigger value="persistent">持久</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {sandbox.lifecycleMode === "session" ? (
        <>
          {/* Preset Selector */}
          <SandboxPresetSelector
            selectedPresetId={matchedPreset?.id}
            onSelect={handlePresetSelect}
            onSaveAsPreset={handleSaveAsPreset}
            currentConfig={currentSessionConfig}
            compact
          />

          {/* CPU */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="sandbox-cpu"
                className="block text-xs font-medium text-foreground"
              >
                CPU ({sandbox.cpu} 核)
              </label>
              <Input
                aria-label="CPU 数值"
                type="number"
                min={0.5}
                max={4}
                step={0.5}
                value={sandbox.cpu}
                onChange={handleCpu}
                className="h-8 w-24 text-right"
              />
            </div>
            <Slider
              id="sandbox-cpu"
              aria-label="CPU 滑块"
              min={0.5}
              max={4}
              step={0.5}
              value={[sandbox.cpu]}
              onChange={handleCpu}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.5 核</span>
              <span>4 核</span>
            </div>
          </div>

          {/* Memory */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="sandbox-memory"
                className="block text-xs font-medium text-foreground"
              >
                Memory ({sandbox.memory} MB)
              </label>
              <Input
                aria-label="Memory 数值"
                type="number"
                min={256}
                max={4096}
                step={256}
                value={sandbox.memory}
                onChange={handleMemory}
                className="h-8 w-24 text-right"
              />
            </div>
            <Slider
              id="sandbox-memory"
              aria-label="Memory 滑块"
              min={256}
              max={4096}
              step={256}
              value={[sandbox.memory]}
              onChange={handleMemory}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>256 MB</span>
              <span>4096 MB</span>
            </div>
          </div>

          {/* Disk */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="sandbox-disk"
                className="block text-xs font-medium text-foreground"
              >
                Disk ({sandbox.disk} GB)
              </label>
              <Input
                aria-label="Disk 数值"
                type="number"
                min={1}
                max={10}
                step={1}
                value={sandbox.disk}
                onChange={handleDisk}
                className="h-8 w-24 text-right"
              />
            </div>
            <Slider
              id="sandbox-disk"
              aria-label="Disk 滑块"
              min={1}
              max={10}
              step={1}
              value={[sandbox.disk]}
              onChange={handleDisk}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 GB</span>
              <span>10 GB</span>
            </div>
          </div>

          {/* Timeout */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="sandbox-timeout"
                className="block text-xs font-medium text-foreground"
              >
                Timeout ({formatSandboxTimeoutHours(sandbox.timeout)})
              </label>
              <Input
                aria-label="Timeout 数值"
                type="number"
                min={0}
                max={168}
                step={0.5}
                value={sandbox.timeout}
                onChange={handleTimeout}
                className="h-8 w-24 text-right"
              />
            </div>
            <Slider
              id="sandbox-timeout"
              aria-label="Timeout 滑块"
              min={0}
              max={168}
              step={0.5}
              value={[sandbox.timeout]}
              onChange={handleTimeout}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 = 不超时</span>
              <span>168 小时</span>
            </div>
            <p className="text-xs text-muted-foreground">
              设为 0 表示不超时；如需显式限制，可设置到最多 168 小时。
            </p>
          </div>

          {/* Summary */}
          <div className="space-y-2 rounded-lg border border-border bg-muted p-3 text-xs">
            <p className="font-medium text-foreground">当前配置</p>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Badge variant="warning" size="sm">
                临时
              </Badge>
              <span>{sandbox.cpu} 核</span>
              <span>&middot;</span>
              <span>{sandbox.memory} MB</span>
              <span>&middot;</span>
              <span>{sandbox.disk} GB</span>
              <span>&middot;</span>
              <span>{formatSandboxTimeoutHours(sandbox.timeout)}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Persistent sandbox selector */}
          <FormField label="选择持久沙箱" htmlFor="sandbox-persistent-select">
            <PersistentSandboxSelector
              selectedId={sandbox.persistentSandboxId}
              onSelect={handleSelectPersistentSandbox}
            />
          </FormField>

          {/* Summary */}
          <div className="space-y-2 rounded-lg border border-border bg-muted p-3 text-xs">
            <p className="font-medium text-foreground">当前配置</p>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Badge variant="info" size="sm">
                持久
              </Badge>
              {sandbox.persistentSandboxName ? (
                <span className="min-w-0 truncate" title={sandbox.persistentSandboxName}>
                  {sandbox.persistentSandboxName}
                </span>
              ) : (
                <span className="italic">未选择沙箱</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
