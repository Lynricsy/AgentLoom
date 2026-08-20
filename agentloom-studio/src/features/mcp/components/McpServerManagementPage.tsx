import { useState, useCallback, useEffect, useMemo, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
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
import { formatRelativeTime } from "@/features/canvas";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import {
  DataTable,
  type DataTableColumn,
} from "@/shared/components/data-table/DataTable";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";
import { ResourceSourceCategoryTabs } from "@/shared/components";
import { useToast } from "@/shared/ui/toast";
import { useMcpServerConfigs } from "../api/mcpQueries";
import {
  useDeleteMcpServerConfig,
  useTestSavedMcpConnection,
  useRediscoverMcpTools,
} from "../api/mcpMutations";
import { McpImportDialog } from "./McpImportDialog";
import { McpServerEditDialog } from "./McpServerEditDialog";
import {
  TRANSPORT_LABEL,
  TRANSPORT_TONE,
  SERVER_STATUS_META,
} from "../lib/mcpPresentation";
import type {
  McpServerConfigSummary,
  McpServerConfigQueryParams,
  McpTransportType,
} from "../types";

const PAGE_SIZE = 20;

const MCP_TONE = "var(--color-node-tool)";

interface ServerRowActionsProps {
  server: McpServerConfigSummary;
  onEdit: (server: McpServerConfigSummary) => void;
  onDelete: (server: McpServerConfigSummary) => void;
  onRediscover: (server: McpServerConfigSummary) => void;
  onReimport: (
    event: MouseEvent<HTMLElement>,
    server: McpServerConfigSummary,
  ) => void;
  onConvertSource: (server: McpServerConfigSummary) => void;
}

function ServerRowActions({
  server,
  onEdit,
  onDelete,
  onRediscover,
  onReimport,
  onConvertSource,
}: ServerRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${server.name} 的更多操作`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => onRediscover(server)}>
          <RefreshCw className="h-3.5 w-3.5" />
          重新发现
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(event) => onReimport(event, server)}>
          <Download className="h-3.5 w-3.5" />
          重新导入
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(server)}>
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </DropdownMenuItem>
        {server.sourceKind === "share_imported" && (
          <DropdownMenuItem onClick={() => onConvertSource(server)}>
            <FolderSync className="h-3.5 w-3.5" />
            转为自己创建
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={() => onDelete(server)}>
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * MCP 服务器列表页面
 * 路由: /resources/mcp-servers
 *
 * 选用 DataTable 而非卡片栅格：服务器条目是同构配置记录，运维时要横向比对
 * 传输方式、连接状态、工具数与最后测试时间，表格比卡片更利于扫读。
 */
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

  useEffect(() => {
    if (!isError) return;
    notify({
      title: "服务器列表加载失败",
      description: "请检查网络后重试。",
      variant: "error",
    });
  }, [isError, notify]);

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
    (event: MouseEvent<HTMLElement>, server: McpServerConfigSummary) => {
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

  const handleOpenServer = useCallback(
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

  const columns = useMemo<DataTableColumn<McpServerConfigSummary>[]>(
    () => [
      {
        key: "name",
        header: "服务器",
        className: "w-full max-w-0",
        cell: (server) => (
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-card"
              style={{
                backgroundColor: `color-mix(in srgb, ${MCP_TONE} 14%, transparent)`,
                color: MCP_TONE,
              }}
            >
              <Server className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {server.name}
              </p>
              <p className="truncate text-xs text-muted">
                {server.description || "暂无描述"}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: "transport",
        header: "传输",
        hideBelow: "md",
        className: "w-24",
        cell: (server) => (
          <Badge size="sm" tone={TRANSPORT_TONE[server.transportType]}>
            {TRANSPORT_LABEL[server.transportType]}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "状态",
        className: "w-24",
        cell: (server) => {
          const statusMeta = SERVER_STATUS_META[server.status];
          return (
            <Badge size="sm" variant={statusMeta.variant}>
              {statusMeta.label}
            </Badge>
          );
        },
      },
      {
        key: "toolCount",
        header: "工具数",
        hideBelow: "sm",
        className: "w-20 tabular-nums",
        cell: (server) => (
          <span className="flex items-center gap-1 whitespace-nowrap text-muted">
            <Zap className="h-3.5 w-3.5" />
            {server.toolCount}
          </span>
        ),
      },
      {
        key: "lastTestedAt",
        header: "最后测试",
        hideBelow: "lg",
        className: "w-28",
        cell: (server) => {
          if (!server.lastTestedAt) return "—";
          const date = new Date(server.lastTestedAt);
          return Number.isNaN(date.getTime()) ? "—" : formatRelativeTime(date);
        },
      },
      {
        key: "actions",
        // 不用 sr-only：绝对定位元素会逃出 DataTable 的横向滚动容器，撑破小屏文档宽度
        header: "操作",
        className: "w-px whitespace-nowrap text-right",
        cell: (server) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            {/* <sm 只留图标：整行本身可点进详情，文字按钮会把主文本列压得过窄 */}
            <Button
              variant="outline"
              size="sm"
              className="px-2 sm:px-3"
              disabled={testMutation.isPending}
              aria-label={`测试连接 ${server.name}`}
              onClick={() => void handleTest(server)}
            >
              <Play className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">测试</span>
            </Button>
            <ServerRowActions
              server={server}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRediscover={(target) => void handleRediscover(target)}
              onReimport={handleReimport}
              onConvertSource={(target) => void handleConvertSource(target)}
            />
          </div>
        ),
      },
    ],
    [
      handleConvertSource,
      handleDelete,
      handleEdit,
      handleReimport,
      handleRediscover,
      handleTest,
      testMutation.isPending,
    ],
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={Server}
        tone={MCP_TONE}
        title="MCP Servers"
        description="管理已导入的 MCP 服务器配置，测试连接状态与工具同步"
        actions={
          <Button
            onClick={(e) => {
              setImportRestoreFocus(e.currentTarget);
              setImportDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            导入新的
          </Button>
        }
      />

      <ResourceSourceCategoryTabs
        value={sourceKindFilter}
        onChange={handleSourceKindChange}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索服务器名称或描述..."
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger aria-label="状态筛选" className="sm:w-32">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">活跃</SelectItem>
              <SelectItem value="inactive">未激活</SelectItem>
              <SelectItem value="error">错误</SelectItem>
            </SelectContent>
          </Select>
          <Select value={transportFilter} onValueChange={handleTransportChange}>
            <SelectTrigger aria-label="传输方式筛选" className="sm:w-36">
              <SelectValue placeholder="全部传输" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部传输</SelectItem>
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
              <SelectItem value="streamable_http">HTTP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="服务器列表加载失败"
          description="请稍后重试，或检查后端服务是否可用。"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              重新加载
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={servers}
          rowKey={(server) => server.id}
          loading={isLoading}
          onRowClick={handleOpenServer}
          empty={
            <EmptyState
              icon={Server}
              tone={MCP_TONE}
              title={
                hasFilters
                  ? "没有匹配的服务器"
                  : sourceKindFilter === "manual"
                    ? "暂无自己创建的 MCP 服务器"
                    : `暂无${getResourceSourceLabel(sourceKindFilter)}的 MCP 服务器`
              }
              description={
                hasFilters
                  ? "换个关键词，或放宽状态与传输方式筛选。"
                  : "导入 MCP 服务器后，其工具会同步到画布的 Imported Tools 分组。"
              }
              action={
                hasFilters ? null : (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      setImportRestoreFocus(e.currentTarget);
                      setImportDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    导入 MCP 服务器
                  </Button>
                )
              }
            />
          }
          pagination={
            meta
              ? {
                  page: meta.page,
                  pageSize: meta.pageSize,
                  total: meta.total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
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
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除服务器「{confirmDelete?.name}
            」吗？关联的工具将不再可用，此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
            >
              {deleteMutation.isPending && (
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
