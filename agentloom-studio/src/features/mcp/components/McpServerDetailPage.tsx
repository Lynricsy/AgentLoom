import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Download, Loader2, Pencil, RefreshCw } from "lucide-react";
import { formatRelativeTime } from "@/features/canvas/lib/formatRelativeTime";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";
import { useMcpServerConfig } from "../api/mcpQueries";
import {
  useDeactivateMcpTool,
  useRediscoverMcpTools,
} from "../api/mcpMutations";
import { McpImportDialog } from "./McpImportDialog";
import { McpServerEditDialog } from "./McpServerEditDialog";
import type {
  McpServerConfigDetail,
  McpToolDefinition,
  McpTransportType,
} from "../types";

// ---------- helpers ----------

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "\u2014";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "\u2014";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRelativeDateTime(value?: string | null): string {
  if (!value) {
    return "\u2014";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "\u2014";
  }

  return formatRelativeTime(date);
}

function getToolLastUpdatedAt(tool: McpToolDefinition): string | null {
  return tool.updatedAt ?? tool.createdAt ?? tool.importedAt ?? null;
}

function getToolImportedAt(tool: McpToolDefinition): string | null {
  return tool.importedAt ?? tool.createdAt ?? null;
}

function getStatusLabel(tool: McpToolDefinition): string {
  return tool.isActive ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528";
}

function getStatusClassName(tool: McpToolDefinition): string {
  return tool.isActive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-border bg-muted/60 text-muted-foreground";
}

// ---------- sub-components ----------

function TransportBadge({ type }: { type: McpTransportType }) {
  const styles: Record<McpTransportType, string> = {
    stdio: "bg-blue-500/15 text-blue-400",
    sse: "bg-green-500/15 text-green-400",
    streamable_http: "bg-purple-500/15 text-purple-400",
  };
  const labels: Record<McpTransportType, string> = {
    stdio: "stdio",
    sse: "SSE",
    streamable_http: "HTTP",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function ServerStatusDot({
  status,
}: {
  status: McpServerConfigDetail["status"];
}) {
  const colors: Record<McpServerConfigDetail["status"], string> = {
    active: "bg-green-400",
    inactive: "bg-yellow-400",
    error: "bg-red-400",
  };
  const labels: Record<McpServerConfigDetail["status"], string> = {
    active: "Active",
    inactive: "Inactive",
    error: "Error",
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}

// ---------- main ----------

interface McpServerDetailPageProps {
  serverId: string;
}

export function McpServerDetailPage({ serverId }: McpServerDetailPageProps) {
  const { notify } = useToast();
  const {
    data: detail,
    isLoading,
    error,
  } = useMcpServerConfig(serverId);

  const rediscoverMutation = useRediscoverMcpTools();
  const deactivateMutation = useDeactivateMcpTool();

  const [search, setSearch] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [reimportDialogState, setReimportDialogState] = useState<{
    open: boolean;
    restoreFocusElement?: HTMLElement | null;
  }>({ open: false, restoreFocusElement: null });
  const [toolToDeactivate, setToolToDeactivate] =
    useState<McpToolDefinition | null>(null);
  const deactivateRestoreFocusRef = useRef<HTMLElement | null>(null);

  const tools = useMemo(() => detail?.tools ?? [], [detail?.tools]);

  const visibleTools = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = tools.filter((tool) => {
      if (!normalizedSearch) {
        return true;
      }

      return [tool.title, tool.name, tool.description]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch));
    });

    return filtered.slice().sort((left, right) => {
      const leftUpdatedAt = getToolLastUpdatedAt(left);
      const rightUpdatedAt = getToolLastUpdatedAt(right);

      if (leftUpdatedAt && rightUpdatedAt) {
        return (
          new Date(rightUpdatedAt).getTime() -
          new Date(leftUpdatedAt).getTime()
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
  }, [tools, search]);

  async function handleRediscover() {
    try {
      await rediscoverMutation.mutateAsync(serverId);
      notify({
        title: "\u5DF2\u91CD\u65B0\u53D1\u73B0\u5DE5\u5177",
        description: "\u5DE5\u5177\u5217\u8868\u5DF2\u5237\u65B0\u3002",
        variant: "success",
      });
    } catch (mutationError) {
      notify({
        title: "\u91CD\u65B0\u53D1\u73B0\u5931\u8D25",
        description:
          mutationError instanceof Error
            ? mutationError.message
            : "\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
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
        title: "\u5DF2\u505C\u7528\u5DE5\u5177",
        description:
          "\u5DE5\u5177\u5DF2\u505C\u7528\uFF0C\u753B\u5E03\u4E2D\u7684 Imported Tools \u5C06\u540C\u6B65\u9690\u85CF\u8BE5\u9879\u3002",
        variant: "success",
      });
      setToolToDeactivate(null);
    } catch (mutationError) {
      notify({
        title: "\u505C\u7528\u5931\u8D25",
        description:
          mutationError instanceof Error
            ? mutationError.message
            : "\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
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

  function openReimportDialog(event: MouseEvent<HTMLButtonElement>) {
    setReimportDialogState({
      open: true,
      restoreFocusElement: event.currentTarget,
    });
  }

  // 构建一个与 McpServerEditDialog 接受的 McpServerConfigSummary 兼容的对象
  const serverSummary = detail
    ? {
        id: detail.id,
        tenantId: detail.tenantId,
        organizationId: detail.organizationId,
        name: detail.name,
        description: detail.description,
        transportType: detail.transportType,
        status: detail.status,
        lastTestedAt: detail.lastTestedAt,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        toolCount: detail.tools.length,
      }
    : null;

  const hasSearch = search.trim().length > 0;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          to="/resources/mcp-servers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回 MCP Servers
        </Link>
        <div className="rounded-2xl border border-error/50 bg-surface-elevated p-6">
          <h2 className="text-lg font-semibold text-foreground">
            加载服务器详情失败
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "未知错误"}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* 头部导航与服务器信息 */}
      <div className="space-y-4">
        <Link
          to="/resources/mcp-servers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回 MCP Servers
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {detail.name}
            </h1>
            <TransportBadge type={detail.transportType} />
            <ServerStatusDot status={detail.status} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={rediscoverMutation.isPending}
              onClick={() => void handleRediscover()}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              重新发现工具
            </Button>
            <Button variant="outline" onClick={openReimportDialog}>
              <Download className="mr-1.5 h-4 w-4" />
              重新导入工具
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              编辑
            </Button>
          </div>
        </div>

        {detail.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {detail.description}
          </p>
        ) : null}
      </div>

      {/* 搜索 */}
      <div className="max-w-xl space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="server-tool-search"
        >
          搜索工具
        </label>
        <Input
          autoComplete="off"
          id="server-tool-search"
          name="serverToolSearch"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="按名称或描述搜索…"
          type="search"
          value={search}
        />
      </div>

      {/* 空状态 */}
      {visibleTools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {hasSearch
              ? "没有匹配的工具"
              : "该服务器下暂无已导入的工具"}
          </p>
        </div>
      ) : null}

      {/* 工具卡片列表 */}
      {visibleTools.length > 0 ? (
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
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClassName(tool)}`}
                    >
                      {getStatusLabel(tool)}
                    </span>
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
                  aria-label={`停用 ${tool.title ?? tool.name}`}
                  disabled={!tool.isActive}
                  onClick={(event) => openDeactivateDialog(event, tool)}
                  variant="outline"
                >
                  {tool.isActive
                    ? `停用 ${tool.title ?? tool.name}`
                    : "已停用"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {/* 重新导入对话框 */}
      <McpImportDialog
        mcpServerConfigId={serverId}
        mode="reimport"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setReimportDialogState({
              open: false,
              restoreFocusElement: null,
            });
          }
        }}
        open={reimportDialogState.open}
        restoreFocusElement={reimportDialogState.restoreFocusElement}
        serverLabel={detail.name}
      />

      {/* 编辑对话框 */}
      <McpServerEditDialog
        server={serverSummary}
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditDialogOpen(false);
        }}
      />

      {/* 停用确认对话框 */}
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
