import { useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Server,
  Wrench,
} from "lucide-react";
import { formatRelativeTime } from "@/features/canvas";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { useToast } from "@/shared/ui/toast";
import { useMcpServerConfig } from "../api/mcpQueries";
import {
  useDeactivateMcpTool,
  useRediscoverMcpTools,
} from "../api/mcpMutations";
import { McpImportDialog } from "./McpImportDialog";
import { McpServerEditDialog } from "./McpServerEditDialog";
import {
  SERVER_STATUS_META,
  TRANSPORT_LABEL,
  TRANSPORT_TONE,
} from "../lib/mcpPresentation";
import type { McpToolDefinition } from "../types";

const MCP_TONE = "var(--color-node-tool)";

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

// ---------- main ----------

interface McpServerDetailPageProps {
  serverId: string;
}

export function McpServerDetailPage({ serverId }: McpServerDetailPageProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const { data: detail, isLoading, error } = useMcpServerConfig(serverId);

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
  }, [tools, search]);

  async function handleRediscover() {
    try {
      await rediscoverMutation.mutateAsync(serverId);
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
      <div
        className="flex h-full flex-col gap-5 p-6"
        data-testid="mcp-server-detail-skeleton"
      >
        <Skeleton className="h-12 w-72 rounded-card" />
        <Skeleton className="h-10 w-full max-w-xl rounded-card" />
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-48 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载服务器详情失败"
          description={
            error instanceof Error
              ? error.message
              : "该服务器可能已被删除，或你没有访问权限。"
          }
          action={
            <Button
              variant="outline"
              onClick={() => void navigate({ to: "/resources/mcp-servers" })}
            >
              返回 MCP Servers
            </Button>
          }
        />
      </div>
    );
  }

  const statusMeta = SERVER_STATUS_META[detail.status];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={Server}
        tone={MCP_TONE}
        breadcrumb={[
          { label: "MCP Servers", to: "/resources/mcp-servers" },
          { label: detail.name },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {detail.name}
            <Badge size="sm" tone={TRANSPORT_TONE[detail.transportType]}>
              {TRANSPORT_LABEL[detail.transportType]}
            </Badge>
            <Badge size="sm" variant={statusMeta.variant}>
              {statusMeta.label}
            </Badge>
          </span>
        }
        description={detail.description || "这个服务器还没有描述"}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void navigate({ to: "/resources/mcp-servers" })}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回
            </Button>
            <Button
              variant="outline"
              disabled={rediscoverMutation.isPending}
              onClick={() => void handleRediscover()}
            >
              {rediscoverMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              重新发现工具
            </Button>
            <Button variant="outline" onClick={openReimportDialog}>
              <Download className="mr-1.5 h-4 w-4" />
              重新导入工具
            </Button>
            <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
              <Pencil className="mr-1.5 h-4 w-4" />
              编辑
            </Button>
          </>
        }
      />

      {/* 搜索 */}
      <div className="max-w-xl space-y-1.5">
        <label htmlFor="server-tool-search">
          <Label>搜索工具</Label>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            autoComplete="off"
            id="server-tool-search"
            name="serverToolSearch"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="按名称或描述搜索…"
            type="search"
            value={search}
            className="pl-9"
          />
        </div>
      </div>

      {visibleTools.length === 0 ? (
        <EmptyState
          icon={Wrench}
          tone={MCP_TONE}
          title={hasSearch ? "没有匹配的工具" : "该服务器下暂无已导入的工具"}
          description={
            hasSearch
              ? "换个关键词试试，搜索会匹配工具名称与描述。"
              : "点击「重新发现工具」从服务器拉取最新的工具定义。"
          }
          action={
            hasSearch ? null : (
              <Button
                size="sm"
                variant="outline"
                disabled={rediscoverMutation.isPending}
                onClick={() => void handleRediscover()}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                重新发现工具
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleTools.map((tool) => (
            <Card key={tool.id} className="p-5">
              <article>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-base font-semibold text-foreground">
                        {tool.title ?? tool.name}
                      </h2>
                      <Badge
                        size="sm"
                        variant={tool.isActive ? "success" : "secondary"}
                      >
                        {tool.isActive ? "已启用" : "已停用"}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted">
                      {tool.description ?? "这个工具没有提供额外描述。"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">
                      工具名称
                    </p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {tool.name}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">
                      最后更新
                    </p>
                    <p className="text-foreground">
                      {formatRelativeDateTime(getToolLastUpdatedAt(tool))}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(getToolLastUpdatedAt(tool))}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">
                      首次导入
                    </p>
                    <p className="text-foreground">
                      {formatRelativeDateTime(getToolImportedAt(tool))}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(getToolImportedAt(tool))}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {tool.portMappingMetadata ? (
                    <>
                      <Badge size="sm" variant="outline">
                        输入 {tool.portMappingMetadata.inputs.length}
                      </Badge>
                      <Badge size="sm" variant="outline">
                        输出 {tool.portMappingMetadata.outputs.length}
                      </Badge>
                    </>
                  ) : null}
                  {tool.annotations ? (
                    <Badge size="sm" variant="outline">
                      注解 {Object.keys(tool.annotations).length} 项
                    </Badge>
                  ) : null}
                  {tool.inputSchema ? (
                    <Badge size="sm" variant="outline">
                      已提供 inputSchema
                    </Badge>
                  ) : null}
                </div>

                {!tool.isActive ? (
                  <p className="mt-4 rounded-card border border-border bg-surface-elevated px-3 py-2 text-sm text-muted">
                    该工具已停用，不会再出现在画布的 Imported Tools 分组中。
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    aria-label={`停用 ${tool.title ?? tool.name}`}
                    disabled={!tool.isActive}
                    onClick={(event) => openDeactivateDialog(event, tool)}
                    variant="outline"
                    size="sm"
                  >
                    {tool.isActive ? `停用 ${tool.title ?? tool.name}` : "已停用"}
                  </Button>
                </div>
              </article>
            </Card>
          ))}
        </div>
      )}

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
      <AlertDialog
        open={toolToDeactivate !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setToolToDeactivate(null);
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            const restoreFocusElement = deactivateRestoreFocusRef.current;

            if (restoreFocusElement) {
              event.preventDefault();
              restoreFocusElement.focus();
            }

            deactivateRestoreFocusRef.current = null;
          }}
        >
          <AlertDialogTitle>停用 MCP 工具</AlertDialogTitle>
          <AlertDialogDescription>
            停用后，这个工具会从工具库中标记为停用，并从画布的 Imported Tools
            中移除。
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivateMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleDeactivate();
              }}
            >
              {deactivateMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              确认停用
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
