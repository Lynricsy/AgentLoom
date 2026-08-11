import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Loader2,
  X,
  Play,
  RefreshCw,
  Zap,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { NativeSelect } from "@/shared/ui/native-select";
import { Switch } from "@/shared/ui/switch";
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

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer border-b-2 px-3 pb-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ToolRow({ tool }: { tool: McpToolDefinition }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
      <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tool.name}</p>
        {tool.description && (
          <p className="truncate text-xs text-muted-foreground">
            {tool.description}
          </p>
        )}
      </div>
    </div>
  );
}

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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="mcp-edit-desc"
          className="fixed left-1/2 top-1/2 z-50 flex w-[min(40rem,calc(100vw-2rem))] max-h-[min(44rem,calc(100vh-4rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface-elevated shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              编辑 MCP 服务器
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only" id="mcp-edit-desc">
            编辑 MCP 服务器配置
          </Dialog.Description>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border px-6 pt-4">
            <TabButton active={tab === "info"} onClick={() => setTab("info")}>
              基本信息
            </TabButton>
            <TabButton
              active={tab === "connection"}
              onClick={() => setTab("connection")}
            >
              连接配置
            </TabButton>
            <TabButton
              active={tab === "tools"}
              onClick={() => setTab("tools")}
            >
              工具 ({tools.length})
            </TabButton>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tab === "info" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="mcp-edit-name"
                  >
                    名称
                  </label>
                  <Input
                    id="mcp-edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="服务器名称"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="mcp-edit-desc-input"
                  >
                    描述
                  </label>
                  <textarea
                    id="mcp-edit-desc-input"
                    rows={3}
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="可选描述"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="mcp-edit-status"
                  >
                    启用状态
                  </label>
                  <Switch
                    id="mcp-edit-status"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                </div>
              </div>
            ) : tab === "connection" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    传输类型
                  </label>
                  <NativeSelect
                    value={transportType}
                    onValueChange={(v) =>
                      setTransportType(v as McpTransportType)
                    }
                    className="w-full"
                  >
                    <option value="stdio">stdio</option>
                    <option value="sse">SSE</option>
                    <option value="streamable_http">Streamable HTTP</option>
                  </NativeSelect>
                </div>

                {transportType === "stdio" ? (
                  <>
                    <div className="space-y-1.5">
                      <label
                        className="text-sm font-medium text-foreground"
                        htmlFor="mcp-edit-command"
                      >
                        命令
                      </label>
                      <Input
                        id="mcp-edit-command"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder="例如: npx, uvx, node"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-sm font-medium text-foreground"
                        htmlFor="mcp-edit-args"
                      >
                        参数
                      </label>
                      <Input
                        id="mcp-edit-args"
                        value={commandArgs}
                        onChange={(e) => setCommandArgs(e.target.value)}
                        placeholder="空格分隔，例如: -y grok-search@latest"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-sm font-medium text-foreground"
                        htmlFor="mcp-edit-env"
                      >
                        环境变量
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {credentialPlaceholder
                          ? "当前已配置的环境变量如下所示（值已隐藏）。如需更新请重新输入所有变量。"
                          : "每行一个，格式: KEY=VALUE"}
                      </p>
                      <textarea
                        id="mcp-edit-env"
                        rows={4}
                        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        value={credentialText}
                        onChange={(e) => {
                          setCredentialText(e.target.value);
                          setCredentialDirty(true);
                        }}
                        placeholder={
                          credentialPlaceholder ||
                          "GROK_API_KEY=sk-xxx\nGROK_API_URL=https://..."
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label
                        className="text-sm font-medium text-foreground"
                        htmlFor="mcp-edit-url"
                      >
                        URL
                      </label>
                      <Input
                        id="mcp-edit-url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/mcp"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-sm font-medium text-foreground"
                        htmlFor="mcp-edit-headers"
                      >
                        请求头
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {credentialPlaceholder
                          ? "当前已配置的请求头如下所示（值已隐藏）。如需更新请重新输入。"
                          : "每行一个，格式: Header-Name=Value"}
                      </p>
                      <textarea
                        id="mcp-edit-headers"
                        rows={4}
                        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testMutation.isPending}
                    onClick={() => void handleTest()}
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    测试已保存的连接
                  </Button>
                  {testMutation.isSuccess && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <Check className="h-3.5 w-3.5" /> 连接正常
                    </span>
                  )}
                  {testMutation.isError && (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <AlertCircle className="h-3.5 w-3.5" /> 连接失败
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* tools tab */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
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
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    重新发现
                  </Button>
                </div>
                {tools.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Zap className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      暂无已导入的工具
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tools.map((tool) => (
                      <ToolRow key={tool.name} tool={tool} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button disabled={!canSave} onClick={handleSave}>
              {updateMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              保存
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
