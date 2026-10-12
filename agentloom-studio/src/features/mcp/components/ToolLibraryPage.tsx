import { useMemo, useRef, useState, type MouseEvent } from "react";
import { AlertCircle, Wrench } from "lucide-react";
import { formatRelativeTime } from "@/features/canvas";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { FormField } from "@/shared/components/form-field/FormField";
import { PageContainer } from "@/shared/components/page-container";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { formatDateTime } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
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
import { Skeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast";
import {
  useDeactivateMcpTool,
  useRediscoverMcpTools,
} from "../api/mcpMutations";
import { useMcpTools } from "../api/mcpQueries";
import { McpImportDialog } from "./McpImportDialog";
import type { McpToolDefinition } from "../types";

const MCP_TONE = "var(--color-node-tool)";

/** 统计卡标签：中文不做 uppercase，字距用 token */
const STAT_LABEL_CLASS = "text-xs font-medium tracking-wide text-muted-foreground";

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
    <PageContainer>
      <PageHeader
        icon={Wrench}
        tone={MCP_TONE}
        title="工具库"
        description="集中管理组织内已导入的 MCP 工具资产，并让画布中的 Imported Tools 与这里保持同步。"
        actions={<Button onClick={openImportDialog}>导入 MCP 工具</Button>}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
          <span className="sr-only">加载工具中…</span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={`stat-${String(index)}`} className="h-[7.25rem] rounded-lg" />
          ))}
        </div>
      ) : !error ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4">
            <p className={STAT_LABEL_CLASS}>工具总数</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {summary.total}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              当前工作区已收录的 MCP 工具
            </p>
          </Card>
          <Card className="p-4">
            <p className={STAT_LABEL_CLASS}>运行状态</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {summary.activeCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              已启用 {summary.activeCount} · 已停用 {summary.inactiveCount}
            </p>
          </Card>
          <Card className="p-4">
            <p className={STAT_LABEL_CLASS}>关联配置</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {summary.serverCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              关联了 {summary.serverCount} 个 MCP 服务器配置
            </p>
          </Card>
          <Card className="p-4">
            <p className={STAT_LABEL_CLASS}>最近更新</p>
            <p className="mt-2 truncate text-2xl font-semibold text-foreground">
              {summary.latestUpdatedAt
                ? formatRelativeDateTime(summary.latestUpdatedAt)
                : "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.latestUpdatedAt
                ? formatDateTime(summary.latestUpdatedAt)
                : "还没有导入记录"}
            </p>
          </Card>
        </div>
      ) : null}

      <FormField label="搜索工具" htmlFor="tool-library-search" className="max-w-xl">
        <Input
          autoComplete="off"
          id="tool-library-search"
          name="toolLibrarySearch"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="按名称、描述或配置 ID 搜索…"
          type="search"
          value={search}
        />
      </FormField>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={`tool-${String(index)}`} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : null}

      {error ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="工具库加载失败"
          description={error instanceof Error ? error.message : "未知错误"}
        />
      ) : null}

      {!isLoading && !error && visibleTools.length === 0 ? (
        <EmptyState
          icon={Wrench}
          tone={MCP_TONE}
          title={hasSearch ? "没有匹配的 MCP 工具" : "还没有导入任何 MCP 工具"}
          description={
            hasSearch
              ? "换个关键词试试。"
              : "导入 MCP 工具后，画布的 Imported Tools 分组会自动同步。"
          }
        />
      ) : null}

      {!isLoading && !error && visibleTools.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleTools.map((tool) => (
            <Card key={tool.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 max-w-full break-words text-sm font-semibold text-foreground">
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

                  <p className="line-clamp-3 break-words text-sm text-muted-foreground">
                    {tool.description ?? "这个工具没有提供额外描述。"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="min-w-0 space-y-1">
                  <p className={STAT_LABEL_CLASS}>工具名称</p>
                  <p className="break-all font-mono text-xs text-foreground">
                    {tool.name}
                  </p>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className={STAT_LABEL_CLASS}>关联配置</p>
                  <p className="break-all font-mono text-xs text-foreground">
                    {tool.mcpServerConfigId ?? "未绑定配置"}
                  </p>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className={STAT_LABEL_CLASS}>最后更新</p>
                  <p className="text-foreground">
                    {formatRelativeDateTime(getToolLastUpdatedAt(tool))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(getToolLastUpdatedAt(tool))}
                  </p>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className={STAT_LABEL_CLASS}>首次导入</p>
                  <p className="text-foreground">
                    {formatRelativeDateTime(getToolImportedAt(tool))}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
                <p className="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  该工具已停用，不会再出现在画布的 Imported Tools 分组中。
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={!tool.mcpServerConfigId}
                  onClick={() => handleRediscover(tool.mcpServerConfigId)}
                  variant="outline"
                  size="sm"
                >
                  重新发现工具
                </Button>
                <Button
                  disabled={!tool.mcpServerConfigId}
                  onClick={(event) => openReimportDialog(event, tool)}
                  variant="outline"
                  size="sm"
                >
                  重新导入工具
                </Button>
                <Button
                  aria-label={`停用 ${tool.title ?? tool.name}`}
                  disabled={!tool.isActive}
                  onClick={(event) => openDeactivateDialog(event, tool)}
                  variant="outline"
                  size="sm"
                >
                  {tool.isActive ? "停用" : "已停用"}
                </Button>
              </div>
            </Card>
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

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setToolToDeactivate(null);
          }
        }}
        open={Boolean(toolToDeactivate)}
      >
        <DialogContent
          size="sm"
          onCloseAutoFocus={(event) => {
            const restoreFocusElement = deactivateRestoreFocusRef.current;

            if (restoreFocusElement) {
              event.preventDefault();
              restoreFocusElement.focus();
            }

            deactivateRestoreFocusRef.current = null;
          }}
        >
          <DialogHeader>
            <DialogTitle>停用 MCP 工具</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              停用后，这个工具会从工具库中标记为停用，并从画布的 Imported Tools
              中移除。
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button onClick={handleDeactivate}>确认停用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
