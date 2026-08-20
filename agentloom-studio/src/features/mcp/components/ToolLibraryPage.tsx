import { useMemo, useRef, useState, type MouseEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { formatRelativeTime } from "@/features/canvas";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";
import {
  useDeactivateMcpTool,
  useRediscoverMcpTools,
} from "../api/mcpMutations";
import { useMcpTools } from "../api/mcpQueries";
import { McpImportDialog } from "./McpImportDialog";
import type { McpToolDefinition } from "../types";

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRelativeDateTime(value?: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return formatRelativeTime(date);
}

function getToolLastUpdatedAt(tool: McpToolDefinition): string | null {
  return tool.updatedAt ?? tool.createdAt ?? tool.importedAt ?? null;
}

function getToolImportedAt(tool: McpToolDefinition): string | null {
  return tool.importedAt ?? tool.createdAt ?? null;
}

export function ToolLibraryPage() {
  const { notify } = useToast();
  const { data: tools = [], isLoading, error } = useMcpTools("mcp");
  const rediscoverMutation = useRediscoverMcpTools();
  const deactivateMutation = useDeactivateMcpTool();

  const [search, setSearch] = useState("");
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    mode: "import" | "reimport";
    mcpServerConfigId?: string;
    restoreFocusElement?: HTMLElement | null;
    serverLabel?: string;
  }>({ open: false, mode: "import", restoreFocusElement: null });
  const [toolToDeactivate, setToolToDeactivate] =
    useState<McpToolDefinition | null>(null);
  const deactivateRestoreFocusRef = useRef<HTMLElement | null>(null);

  const mcpTools = useMemo(
    () => tools.filter((tool) => tool.source === "mcp"),
    [tools],
  );

  const summary = useMemo(() => {
    const activeCount = mcpTools.filter((tool) => tool.isActive).length;
    const inactiveCount = mcpTools.length - activeCount;
    const serverCount = new Set(
      mcpTools
        .map((tool) => tool.mcpServerConfigId)
        .filter((value): value is string => Boolean(value)),
    ).size;
    const latestUpdatedAt = mcpTools.reduce<string | null>((latest, tool) => {
      const candidate = getToolLastUpdatedAt(tool);

      if (!candidate) {
        return latest;
      }

      if (!latest) {
        return candidate;
      }

      return new Date(candidate).getTime() > new Date(latest).getTime()
        ? candidate
        : latest;
    }, null);

    return {
      total: mcpTools.length,
      activeCount,
      inactiveCount,
      serverCount,
      latestUpdatedAt,
    };
  }, [mcpTools]);

  const visibleTools = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = mcpTools.filter((tool) => {
      if (!normalizedSearch) {
        return true;
      }

      return [tool.title, tool.name, tool.description, tool.mcpServerConfigId]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch));
    });

    return filtered.slice().sort((left, right) => {
      const leftUpdatedAt = getToolLastUpdatedAt(left);
      const rightUpdatedAt = getToolLastUpdatedAt(right);

      if (leftUpdatedAt && rightUpdatedAt) {
        return (
          new Date(rightUpdatedAt).getTime() - new Date(leftUpdatedAt).getTime()
        );
      }

      if (rightUpdatedAt) {
        return 1;
      }

      if (leftUpdatedAt) {
        return -1;
      }

      return (left.title ?? left.name).localeCompare(
        right.title ?? right.name,
        "zh-CN",
      );
    });
  }, [mcpTools, search]);

  async function handleRediscover(mcpServerConfigId?: string | null) {
    if (!mcpServerConfigId) {
      return;
    }

    try {
      await rediscoverMutation.mutateAsync(mcpServerConfigId);
      notify({
        title: "已重新发现工具",
        description: "工具列表已刷新。",
        variant: "success",
      });
    } catch (mutationError) {
      notify({
        title: "重新发现失败",
        description:
          mutationError instanceof Error
            ? mutationError.message
            : "请稍后重试。",
        variant: "error",
      });
    }
  }

  async function handleDeactivate() {
    if (!toolToDeactivate) {
      return;
    }

    try {
      await deactivateMutation.mutateAsync(toolToDeactivate.id);
      notify({
        title: "已停用工具",
        description: "工具已停用，画布中的 Imported Tools 将同步隐藏该项。",
        variant: "success",
      });
      setToolToDeactivate(null);
    } catch (mutationError) {
      notify({
        title: "停用失败",
        description:
          mutationError instanceof Error
            ? mutationError.message
            : "请稍后重试。",
        variant: "error",
      });
    }
  }

  function openDeactivateDialog(
    event: MouseEvent<HTMLButtonElement>,
    tool: McpToolDefinition,
  ) {
    deactivateRestoreFocusRef.current = event.currentTarget;
    setToolToDeactivate(tool);
  }

  function openImportDialog(event: MouseEvent<HTMLButtonElement>) {
    setDialogState({
      open: true,
      mode: "import",
      restoreFocusElement: event.currentTarget,
    });
  }

  function openReimportDialog(
    event: MouseEvent<HTMLButtonElement>,
    tool: McpToolDefinition,
  ) {
    setDialogState({
      open: true,
      mode: "reimport",
      mcpServerConfigId: tool.mcpServerConfigId ?? undefined,
      restoreFocusElement: event.currentTarget,
      serverLabel: tool.mcpServerConfigId
        ? `配置 ${tool.mcpServerConfigId}`
        : (tool.title ?? tool.name),
    });
  }

  const hasSearch = search.trim().length > 0;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">工具库</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            集中管理组织内已导入的 MCP 工具资产，并让画布中的 Imported Tools
            与这里保持同步。
          </p>
        </div>

        <Button onClick={openImportDialog}>导入 MCP 工具</Button>
      </div>

      {!isLoading && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              工具总数
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {summary.total}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              当前工作区已收录的 MCP 工具
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              运行状态
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {summary.activeCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              已启用 {summary.activeCount} · 已停用 {summary.inactiveCount}
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              关联配置
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {summary.serverCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              关联了 {summary.serverCount} 个 MCP 服务器配置
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              最近更新
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {summary.latestUpdatedAt
                ? formatRelativeDateTime(summary.latestUpdatedAt)
                : "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.latestUpdatedAt
                ? formatDateTime(summary.latestUpdatedAt)
                : "还没有导入记录"}
            </p>
          </section>
        </div>
      ) : null}

      <div className="max-w-xl space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="tool-library-search"
        >
          搜索工具
        </label>
        <Input
          autoComplete="off"
          id="tool-library-search"
          name="toolLibrarySearch"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="按名称、描述或配置 ID 搜索…"
          type="search"
          value={search}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载工具中…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-error/50 bg-surface-elevated p-6">
          <h2 className="text-lg font-semibold text-foreground">
            工具库加载失败
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "未知错误"}
          </p>
        </div>
      ) : null}

      {!isLoading && !error && visibleTools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {hasSearch ? "没有匹配的 MCP 工具" : "还没有导入任何 MCP 工具"}
          </p>
        </div>
      ) : null}

      {!isLoading && !error && visibleTools.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleTools.map((tool) => (
            <article
              key={tool.id}
              className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {tool.title ?? tool.name}
                    </h2>
                    <Badge
                      size="sm"
                      variant={tool.isActive ? "success" : "secondary"}
                    >
                      {tool.isActive ? "已启用" : "已停用"}
                    </Badge>
                    <Badge size="sm" variant="outline">
                      来源 MCP
                    </Badge>
                  </div>

                  {tool.description ? (
                    <p className="text-sm text-muted-foreground">
                      {tool.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      这个工具没有提供额外描述。
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    工具名称
                  </p>
                  <p className="font-mono text-xs text-foreground">
                    {tool.name}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    关联配置
                  </p>
                  <p className="font-mono text-xs break-all text-foreground">
                    {tool.mcpServerConfigId ?? "未绑定配置"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    最后更新
                  </p>
                  <p className="text-foreground">
                    {formatRelativeDateTime(getToolLastUpdatedAt(tool))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(getToolLastUpdatedAt(tool))}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    首次导入
                  </p>
                  <p className="text-foreground">
                    {formatRelativeDateTime(getToolImportedAt(tool))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(getToolImportedAt(tool))}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {tool.portMappingMetadata ? (
                  <>
                    <span className="rounded-full border border-border px-2 py-1">
                      输入 {tool.portMappingMetadata.inputs.length}
                    </span>
                    <span className="rounded-full border border-border px-2 py-1">
                      输出 {tool.portMappingMetadata.outputs.length}
                    </span>
                  </>
                ) : null}
                {tool.annotations ? (
                  <span className="rounded-full border border-border px-2 py-1">
                    注解 {Object.keys(tool.annotations).length} 项
                  </span>
                ) : null}
                {tool.inputSchema ? (
                  <span className="rounded-full border border-border px-2 py-1">
                    已提供 inputSchema
                  </span>
                ) : null}
              </div>

              {!tool.isActive ? (
                <p className="mt-4 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
                  该工具已停用，不会再出现在画布的 Imported Tools 分组中。
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  disabled={!tool.mcpServerConfigId}
                  onClick={() => handleRediscover(tool.mcpServerConfigId)}
                  variant="outline"
                >
                  重新发现工具
                </Button>
                <Button
                  disabled={!tool.mcpServerConfigId}
                  onClick={(event) => openReimportDialog(event, tool)}
                  variant="outline"
                >
                  重新导入工具
                </Button>
                <Button
                  aria-label={`停用 ${tool.title ?? tool.name}`}
                  disabled={!tool.isActive}
                  onClick={(event) => openDeactivateDialog(event, tool)}
                  variant="outline"
                >
                  {tool.isActive ? `停用 ${tool.title ?? tool.name}` : "已停用"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <McpImportDialog
        mcpServerConfigId={dialogState.mcpServerConfigId}
        mode={dialogState.mode}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDialogState({
              open: false,
              mode: "import",
              restoreFocusElement: null,
            });
          }
        }}
        open={dialogState.open}
        restoreFocusElement={dialogState.restoreFocusElement}
        serverLabel={dialogState.serverLabel}
      />

      <Dialog.Root
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setToolToDeactivate(null);
          }
        }}
        open={Boolean(toolToDeactivate)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 px-4 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby="mcp-tool-deactivate-description"
            className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl"
            onCloseAutoFocus={(event) => {
              const restoreFocusElement = deactivateRestoreFocusRef.current;

              if (restoreFocusElement) {
                event.preventDefault();
                restoreFocusElement.focus();
              }

              deactivateRestoreFocusRef.current = null;
            }}
          >
            <div className="space-y-2">
              <Dialog.Title className="text-lg font-semibold text-foreground">
                停用 MCP 工具
              </Dialog.Title>
              <Dialog.Description
                className="text-sm text-muted-foreground"
                id="mcp-tool-deactivate-description"
              >
                停用后，这个工具会从工具库中标记为停用，并从画布的 Imported
                Tools 中移除。
              </Dialog.Description>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="outline">取消</Button>
              </Dialog.Close>
              <Button onClick={handleDeactivate}>确认停用</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
