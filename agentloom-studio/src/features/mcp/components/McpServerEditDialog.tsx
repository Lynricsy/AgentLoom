import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Loader2,
  Play,
  RefreshCw,
  Zap,
  Check,
  AlertCircle,
} from "lucide-react";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { FormField } from "@/shared/components/form-field/FormField";
import { fadeIn } from "@/shared/lib/motion";
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
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Textarea } from "@/shared/ui/textarea";
import { useToast } from "@/shared/ui/toast";
import { useMcpServerConfig } from "../api/mcpQueries";
import {
  useUpdateMcpServerConfig,
  useTestSavedMcpConnection,
  useRediscoverMcpTools,
} from "../api/mcpMutations";
import type {
  McpServerConfigSummary,
  McpTransportType,
  McpToolDefinition,
  UpdateMcpServerConfigPayload,
} from "../types";

interface McpServerEditDialogProps {
  server: McpServerConfigSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------- helpers ----------

function parseStructuredText(
  raw: string,
): Record<string, string> | undefined {
  const entries = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const sep = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      if (sep <= 0) return [];
      const key = line.slice(0, sep).trim();
      const value = line.slice(sep + 1).trim();
      return key ? [[key, value] as const] : [];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseCommandArgs(raw: string): string[] | undefined {
  const args = raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return args.length > 0 ? args : undefined;
}

// ---------- sub-components ----------

function ToolRow({ tool }: { tool: McpToolDefinition }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
      <Zap className="size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={tool.name}>
          {tool.name}
        </p>
        {tool.description && (
          <p className="truncate text-xs text-muted-foreground" title={tool.description}>
            {tool.description}
          </p>
        )}
      </div>
    </div>
  );
}

type EditTab = "info" | "connection" | "tools";

// ---------- main ----------

export function McpServerEditDialog({
  server,
  open,
  onOpenChange,
}: McpServerEditDialogProps) {
  const { notify } = useToast();
  const [tab, setTab] = useState<"info" | "connection" | "tools">("info");

  // form state — basic info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // form state — connection
  const [transportType, setTransportType] = useState<McpTransportType>("stdio");
  const [command, setCommand] = useState("");
  const [commandArgs, setCommandArgs] = useState("");
  const [url, setUrl] = useState("");
  const [credentialText, setCredentialText] = useState("");
  const [credentialPlaceholder, setCredentialPlaceholder] = useState("");
  const [credentialDirty, setCredentialDirty] = useState(false);

  // mutations / queries
  const updateMutation = useUpdateMcpServerConfig();
  const testMutation = useTestSavedMcpConnection();
  const rediscoverMutation = useRediscoverMcpTools();

  const {
    data: detail,
    isLoading: detailLoading,
  } = useMcpServerConfig(server?.id ?? "", { enabled: open && !!server?.id });

  // sync form when detail loads
  const prevIdRef = useRef<string | null>(null);
  const detailId = detail?.id ?? null;
  if (detail && detailId && detailId !== prevIdRef.current) {
    prevIdRef.current = detailId;
    setName(detail.name);
    setDescription(detail.description ?? "");
    setIsActive(detail.status === "active");
    setTransportType(detail.transportType);
    setCommand(detail.command ?? "");
    setCommandArgs(detail.args?.join(" ") ?? "");
    setUrl(detail.url ?? "");

    const keys = detail.credentialKeys ?? [];
    setCredentialPlaceholder(
      keys.length > 0
        ? keys.map((k) => `${k}=******`).join("\n")
        : "",
    );
    setCredentialText("");
    setCredentialDirty(false);
  }

  // reset on close
  useEffect(() => {
    if (!open) {
      prevIdRef.current = null;
      setTab("info");
    }
  }, [open]);

  const tools: McpToolDefinition[] = detail?.tools ?? [];

  // build save payload
  function handleSave() {
    if (!server) return;

    const payload: UpdateMcpServerConfigPayload = {
      name: name.trim(),
      description: description.trim() || null,
      status: isActive ? "active" : "inactive",
    };

    // 连接配置变更
    const connChanged =
      transportType !== detail?.transportType ||
      command !== (detail?.command ?? "") ||
      commandArgs !== (detail?.args?.join(" ") ?? "") ||
      url !== (detail?.url ?? "") ||
      credentialDirty;

    if (connChanged) {
      if (transportType === "stdio") {
        payload.connection = {
          transportType: "stdio",
          command: command.trim(),
          args: parseCommandArgs(commandArgs),
          ...(credentialDirty && credentialText.trim()
            ? { env: parseStructuredText(credentialText) }
            : {}),
        };
      } else {
        payload.connection = {
          transportType,
          url: url.trim(),
          ...(credentialDirty && credentialText.trim()
            ? { headers: parseStructuredText(credentialText) }
            : {}),
        };
      }
    }

    updateMutation.mutate(
      { id: server.id, data: payload },
      {
        onSuccess: () => {
          notify({ title: "已保存", description: "MCP Server 配置已更新", variant: "success" });
          onOpenChange(false);
        },
      },
    );
  }

  async function handleTest() {
    if (!server) return;
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
      }
    } catch (err) {
      notify({
        title: "连接测试失败",
        description: err instanceof Error ? err.message : "请稍后重试。",
        variant: "error",
      });
    }
  }

  async function handleRediscover() {
    if (!server) return;
    try {
      const result = await rediscoverMutation.mutateAsync(server.id);
      notify({
        title: "已重新发现工具",
        description: `发现 ${result.tools.length} 个工具`,
        variant: "success",
      });
    } catch (err) {
      notify({
        title: "重新发现失败",
        description: err instanceof Error ? err.message : "请稍后重试。",
        variant: "error",
      });
    }
  }

  const canSave = name.trim().length > 0 && !updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="mcp-edit-desc"
        className="sm:max-h-[min(44rem,calc(100vh-4rem))]"
        size="lg"
      >
          {/* Header */}
          <DialogHeader className="border-b-0 pb-0">
            <DialogTitle>编辑 MCP 服务器</DialogTitle>
            <DialogDescription className="sr-only" id="mcp-edit-desc">
              编辑 MCP 服务器配置
            </DialogDescription>
          </DialogHeader>

          <Tabs
            defaultValue="info"
            value={tab}
            onValueChange={(next) => setTab(next as EditTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="px-6 pt-4">
              <TabsList className="w-full">
                <TabsTrigger value="info">基本信息</TabsTrigger>
                <TabsTrigger value="connection">连接配置</TabsTrigger>
                <TabsTrigger value="tools">工具（{tools.length}）</TabsTrigger>
              </TabsList>
            </div>

            {/* Body */}
            <DialogBody className="py-5">
              {detailLoading ? (
                <div className="space-y-4" aria-busy>
                  <Skeleton className="h-[3.75rem] w-full" />
                  <Skeleton className="h-[6.25rem] w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : (
                <>
                  <TabsContent value="info">
                    <FormField label="名称" htmlFor="mcp-edit-name">
                      <Input
                        id="mcp-edit-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="服务器名称"
                      />
                    </FormField>
                    <FormField label="描述" htmlFor="mcp-edit-desc-input">
                      <Textarea
                        id="mcp-edit-desc-input"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="可选描述"
                      />
                    </FormField>
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="mcp-edit-status"
                        className="text-xs font-medium text-foreground"
                      >
                        启用状态
                      </label>
                      <Switch
                        id="mcp-edit-status"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="connection">
                    <FormField label="传输类型">
                      <Select
                        value={transportType}
                        onValueChange={(v) =>
                          setTransportType(v as McpTransportType)
                        }
                      >
                        <SelectTrigger aria-label="传输类型" className="w-full">
                          <SelectValue placeholder="请选择传输类型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stdio">stdio</SelectItem>
                          <SelectItem value="sse">SSE</SelectItem>
                          <SelectItem value="streamable_http">
                            Streamable HTTP
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>

                    {transportType === "stdio" ? (
                      <>
                        <FormField label="命令" htmlFor="mcp-edit-command">
                          <Input
                            id="mcp-edit-command"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder="例如：npx、uvx、node"
                          />
                        </FormField>
                        <FormField label="参数" htmlFor="mcp-edit-args">
                          <Input
                            id="mcp-edit-args"
                            value={commandArgs}
                            onChange={(e) => setCommandArgs(e.target.value)}
                            placeholder="空格分隔，例如：-y grok-search@latest"
                          />
                        </FormField>
                        <FormField
                          label="环境变量"
                          htmlFor="mcp-edit-env"
                          hint={
                            credentialPlaceholder
                              ? "当前已配置的环境变量如下所示（值已隐藏）。如需更新请重新输入所有变量。"
                              : "每行一个，格式：KEY=VALUE"
                          }
                        >
                          <Textarea
                            id="mcp-edit-env"
                            rows={4}
                            className="font-mono text-xs"
                            value={credentialText}
                            onChange={(e) => {
                              setCredentialText(e.target.value);
                              setCredentialDirty(true);
                            }}
                            placeholder={
                              credentialPlaceholder ||
                              "GROK_API_KEY=sk-xxx\nGROK_API_URL=https://…"
                            }
                          />
                        </FormField>
                      </>
                    ) : (
                      <>
                        <FormField label="URL" htmlFor="mcp-edit-url">
                          <Input
                            id="mcp-edit-url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/mcp"
                          />
                        </FormField>
                        <FormField
                          label="请求头"
                          htmlFor="mcp-edit-headers"
                          hint={
                            credentialPlaceholder
                              ? "当前已配置的请求头如下所示（值已隐藏）。如需更新请重新输入。"
                              : "每行一个，格式：Header-Name=Value"
                          }
                        >
                          <Textarea
                            id="mcp-edit-headers"
                            rows={4}
                            className="font-mono text-xs"
                            value={credentialText}
                            onChange={(e) => {
                              setCredentialText(e.target.value);
                              setCredentialDirty(true);
                            }}
                            placeholder={
                              credentialPlaceholder ||
                              "Authorization=Bearer xxx"
                            }
                          />
                        </FormField>
                      </>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={testMutation.isPending}
                        onClick={() => void handleTest()}
                      >
                        {testMutation.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Play />
                        )}
                        测试已保存的连接
                      </Button>
                      <AnimatePresence mode="wait" initial={false}>
                        {testMutation.isSuccess && (
                          <motion.span
                            key="ok"
                            {...fadeIn}
                            className="flex items-center gap-1 text-xs text-success"
                          >
                            <Check className="size-3.5" /> 连接正常
                          </motion.span>
                        )}
                        {testMutation.isError && (
                          <motion.span
                            key="fail"
                            {...fadeIn}
                            className="flex items-center gap-1 text-xs text-error"
                          >
                            <AlertCircle className="size-3.5" /> 连接失败
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </TabsContent>

                  <TabsContent value="tools" className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        已导入 {tools.length} 个工具
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rediscoverMutation.isPending}
                        onClick={() => void handleRediscover()}
                      >
                        {rediscoverMutation.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RefreshCw />
                        )}
                        重新发现
                      </Button>
                    </div>
                    {tools.length === 0 ? (
                      <EmptyState
                        variant="plain"
                        icon={Zap}
                        title="暂无已导入的工具"
                        className="py-8"
                      />
                    ) : (
                      <div className="space-y-2">
                        {tools.map((tool) => (
                          <ToolRow key={tool.name} tool={tool} />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </>
              )}
            </DialogBody>
          </Tabs>

          {/* Footer */}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button disabled={!canSave} onClick={handleSave}>
              {updateMutation.isPending && <Loader2 className="animate-spin" />}
              保存
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
