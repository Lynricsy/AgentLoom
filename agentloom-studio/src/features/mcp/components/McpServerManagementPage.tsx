import { useState, useCallback, useMemo, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  Plus,
  Server,
  MoreVertical,
  Pencil,
  Trash2,
  RefreshCw,
  FolderSync,
  Play,
  Loader2,
  Zap,
  Download,
} from "lucide-react";
import { formatRelativeTime } from "@/features/canvas/lib/formatRelativeTime";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Pagination, ResourceSourceCategoryTabs } from "@/shared/components";
import { useToast } from "@/shared/ui/toast";
import { useMcpServerConfigs } from "../api/mcpQueries";
import {
  useDeleteMcpServerConfig,
  useTestSavedMcpConnection,
  useRediscoverMcpTools,
} from "../api/mcpMutations";
import { McpImportDialog } from "./McpImportDialog";
import { McpServerEditDialog } from "./McpServerEditDialog";
import type {
  McpServerConfigSummary,
  McpServerConfigQueryParams,
  McpTransportType,
} from "../types";

const PAGE_SIZE = 20;

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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function StatusDot({ status }: { status: McpServerConfigSummary["status"] }) {
  const colors: Record<McpServerConfigSummary["status"], string> = {
    active: "bg-green-400",
    inactive: "bg-yellow-400",
    error: "bg-red-400",
  };
  const labels: Record<McpServerConfigSummary["status"], string> = {
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

function formatRelativeDateTime(value?: string | null): string {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return formatRelativeTime(date);
}

interface ServerCardActionsProps {
  server: McpServerConfigSummary;
  onEdit: (server: McpServerConfigSummary) => void;
  onDelete: (server: McpServerConfigSummary) => void;
  onRediscover: (server: McpServerConfigSummary) => void;
  onReimport: (
    event: MouseEvent<HTMLButtonElement>,
    server: McpServerConfigSummary,
  ) => void;
  onConvertSource: (server: McpServerConfigSummary) => void;
}

function ServerCardActions({
  server,
  onEdit,
  onDelete,
  onRediscover,
  onReimport,
  onConvertSource,
}: ServerCardActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            role="button"
            tabIndex={-1}
            aria-label="关闭菜单"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-card py-1 shadow-xl">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                onRediscover(server);
                setOpen(false);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重新发现
            </button>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                onReimport(e, server);
                setOpen(false);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              重新导入
            </button>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                onEdit(server);
                setOpen(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            {server.sourceKind === "share_imported" ? (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => {
                  onConvertSource(server);
                  setOpen(false);
                }}
              >
                <FolderSync className="h-3.5 w-3.5" />
                转为自己创建
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-red-400 transition-colors hover:bg-red-500/10"
              onClick={() => {
                onDelete(server);
                setOpen(false);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function McpServerManagementPage() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [transportFilter, setTransportFilter] = useState<string>("all");
  const [sourceKindFilter, setSourceKindFilter] =
    useState<ResourceSourceKind>("manual");

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRestoreFocus, setImportRestoreFocus] =
    useState<HTMLElement | null>(null);
  const [reimportState, setReimportState] = useState<{
    open: boolean;
    mcpServerConfigId?: string;
    restoreFocusElement?: HTMLElement | null;
    serverLabel?: string;
  }>({ open: false });

  const [editingServer, setEditingServer] =
    useState<McpServerConfigSummary | null>(null);
  const [confirmDelete, setConfirmDelete] =
    useState<McpServerConfigSummary | null>(null);

  const deleteMutation = useDeleteMcpServerConfig();
  const testMutation = useTestSavedMcpConnection();
  const rediscoverMutation = useRediscoverMcpTools();

  const params = useMemo<McpServerConfigQueryParams>(() => {
    const p: McpServerConfigQueryParams = { page, pageSize: PAGE_SIZE };
    if (search.trim()) p.search = search.trim();
    if (statusFilter !== "all")
      p.status = statusFilter as McpServerConfigSummary["status"];
    if (transportFilter !== "all")
      p.transportType = transportFilter as McpTransportType;
    p.sourceKind = sourceKindFilter;
    return p;
  }, [page, search, statusFilter, transportFilter, sourceKindFilter]);

  const { data, isLoading, isError, refetch } = useMcpServerConfigs(params);
  const servers = data?.data ?? [];
  const meta = data?.meta;

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const handleTransportChange = useCallback((value: string) => {
    setTransportFilter(value);
    setPage(1);
  }, []);

  const handleSourceKindChange = useCallback((value: ResourceSourceKind) => {
    setSourceKindFilter(value);
    setPage(1);
  }, []);

  const handleTest = useCallback(
    async (server: McpServerConfigSummary) => {
      try {
        const result = await testMutation.mutateAsync(server.id);
        if (result.success) {
          notify({
            title: "连接测试成功",
            description: result.serverInfo
              ? `${result.serverInfo.name} v${result.serverInfo.version}`
              : "服务器连接正常。",
            variant: "success",
          });
        } else {
          notify({
            title: "连接测试失败",
            description: "无法连接到服务器。",
            variant: "error",
          });
        }
      } catch (err) {
        notify({
          title: "连接测试失败",
          description: err instanceof Error ? err.message : "请稍后重试。",
          variant: "error",
        });
      }
    },
    [testMutation, notify],
  );

  const handleRediscover = useCallback(
    async (server: McpServerConfigSummary) => {
      try {
        await rediscoverMutation.mutateAsync(server.id);
        notify({
          title: "已重新发现工具",
          description: "工具列表已刷新。",
          variant: "success",
        });
      } catch (err) {
        notify({
          title: "重新发现失败",
          description: err instanceof Error ? err.message : "请稍后重试。",
          variant: "error",
        });
      }
    },
    [rediscoverMutation, notify],
  );

  const handleReimport = useCallback(
    (event: MouseEvent<HTMLButtonElement>, server: McpServerConfigSummary) => {
      setReimportState({
        open: true,
        mcpServerConfigId: server.id,
        restoreFocusElement: event.currentTarget,
        serverLabel: server.name,
      });
    },
    [],
  );

  const handleEdit = useCallback((server: McpServerConfigSummary) => {
    setEditingServer(server);
  }, []);

  const handleDelete = useCallback((server: McpServerConfigSummary) => {
    setConfirmDelete(server);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        setConfirmDelete(null);
        notify({
          title: "已删除",
          description: `已删除服务器「${confirmDelete.name}」。`,
          variant: "success",
        });
      },
    });
  }, [confirmDelete, deleteMutation, notify]);

  const handleCardClick = useCallback(
    (server: McpServerConfigSummary) => {
      void navigate({
        to: "/resources/mcp-servers/$serverId",
        params: { serverId: server.id },
      });
    },
    [navigate],
  );

  const handleConvertSource = useCallback(
    async (server: McpServerConfigSummary) => {
      try {
        await convertResourceSourceToManual("mcp_server_config", server.id);
        await refetch();
      } catch {
        // noop
      }
    },
    [refetch],
  );

  const hasFilters =
    search.trim() !== "" || statusFilter !== "all" || transportFilter !== "all";

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">MCP Servers</h1>
          <p className="text-sm text-muted-foreground">
            管理已导入的 MCP 服务器配置，测试连接状态与工具同步
          </p>
        </div>
        <Button
          onClick={(e) => {
            setImportRestoreFocus(e.currentTarget);
            setImportDialogOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          导入新的
        </Button>
      </div>

      <ResourceSourceCategoryTabs
        value={sourceKindFilter}
        onChange={handleSourceKindChange}
      />

      {/* 筛选行 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索服务器名称或描述..."
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={handleStatusChange}
          className="w-32"
        >
          <option value="all">全部状态</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="error">Error</option>
        </Select>
        <Select
          value={transportFilter}
          onValueChange={handleTransportChange}
          className="w-40"
        >
          <option value="all">全部传输</option>
          <option value="stdio">stdio</option>
          <option value="sse">SSE</option>
          <option value="streamable_http">HTTP</option>
        </Select>
      </div>

      {/* 列表内容 */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
          <Zap className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium">服务器列表加载失败</p>
          <p className="text-sm text-muted-foreground">请稍后重试</p>
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      ) : servers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
          <Server className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "没有匹配的服务器"
              : sourceKindFilter === "manual"
                ? "暂无自己创建的 MCP 服务器，点击右上角导入"
                : `暂无${getResourceSourceLabel(sourceKindFilter)}的 MCP 服务器`}
          </p>
        </div>
      ) : (
        <>
          {/* 卡片列表 */}
          <div className="grid gap-4 xl:grid-cols-2">
            {servers.map((server) => (
              <article
                key={server.id}
                className="cursor-pointer rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm transition-colors hover:border-border/80"
                onClick={() => handleCardClick(server)}
                role="link"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Server className="h-4 w-4" />
                      </div>
                      <h2 className="truncate text-sm font-semibold text-foreground">
                        {server.name}
                      </h2>
                      <TransportBadge type={server.transportType} />
                      <StatusDot status={server.status} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {server.description || "暂无描述"}
                    </p>
                  </div>
                  <div
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testMutation.isPending}
                      onClick={() => void handleTest(server)}
                      title="测试连接"
                    >
                      <Play className="mr-1 h-3.5 w-3.5" />
                      Test
                    </Button>
                    <ServerCardActions
                      server={server}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onRediscover={() => void handleRediscover(server)}
                      onReimport={handleReimport}
                      onConvertSource={handleConvertSource}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    {server.toolCount} 个工具
                  </span>
                  <span>
                    最后测试: {formatRelativeDateTime(server.lastTestedAt)}
                  </span>
                </div>
              </article>
            ))}
          </div>

          {/* 分页 */}
          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          )}
        </>
      )}

      {/* 导入对话框（新建） */}
      <McpImportDialog
        open={importDialogOpen}
        mode="import"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setImportDialogOpen(false);
            setImportRestoreFocus(null);
          }
        }}
        restoreFocusElement={importRestoreFocus}
      />

      {/* 重新导入对话框 */}
      <McpImportDialog
        open={reimportState.open}
        mode="reimport"
        mcpServerConfigId={reimportState.mcpServerConfigId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setReimportState({ open: false });
          }
        }}
        restoreFocusElement={reimportState.restoreFocusElement}
        serverLabel={reimportState.serverLabel}
      />

      {/* 编辑对话框 */}
      <McpServerEditDialog
        server={editingServer}
        open={editingServer !== null}
        onOpenChange={(open) => {
          if (!open) setEditingServer(null);
        }}
      />

      {/* 删除确认对话框 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirmDelete(null);
            }}
            role="button"
            tabIndex={-1}
            aria-label="关闭对话框"
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold">确认删除</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              确定要删除服务器「{confirmDelete.name}
              」吗？关联的工具将不再可用，此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
