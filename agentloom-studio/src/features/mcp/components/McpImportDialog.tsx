import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useDiscoverMcpTools,
  useImportMcpTools,
  useRediscoverMcpTools,
  useReimportMcpTools,
  useTestMcpConnection,
  useTestSavedMcpConnection,
} from "../api/mcpMutations";
import {
  RECEIPT_STATUS_LABELS,
  type DiscoveredMcpTool,
  type DiscoverMcpToolsResult,
  type ImportMcpToolsResult,
  type McpConnectionConfig,
  type McpImportConflictStrategy,
  type McpImportDialogProps,
  type McpServerInfo,
  type McpTransportType,
  type TestMcpConnectionResult,
} from "../types";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useToast } from "@/shared/ui/toast";

type StepId = 1 | 2 | 3 | 4;

interface ConnectionFormState {
  serverName: string;
  serverDescription: string;
  transportType: McpTransportType;
  command: string;
  commandArgs: string;
  envText: string;
  url: string;
  headersText: string;
}

const INITIAL_FORM_STATE: ConnectionFormState = {
  serverName: "",
  serverDescription: "",
  transportType: "stdio",
  command: "",
  commandArgs: "",
  envText: "",
  url: "",
  headersText: "",
};

const STEP_DEFINITIONS: Array<{
  id: StepId;
  name: string;
  description: string;
}> = [
  { id: 1, name: "配置连接", description: "填写服务器与传输方式" },
  { id: 2, name: "测试连接", description: "验证服务可访问性" },
  { id: 3, name: "发现工具", description: "查看并选择可导入工具" },
  { id: 4, name: "导入并复核", description: "提交导入并查看回执" },
];

const FIELD_CLASS_NAME =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50";

function parseCommandArgs(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      const compactFlagMatch = value.match(/^(-{1,2}[\w-]+)(@.+)$/);

      if (compactFlagMatch) {
        const flag = compactFlagMatch[1];
        const packageName = compactFlagMatch[2];

        if (flag && packageName) {
          return [flag, packageName];
        }
      }

      return [value];
    });
}

function parseStructuredText(raw: string): Record<string, string> | undefined {
  const entries = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const separatorIndex = line.includes("=")
        ? line.indexOf("=")
        : line.indexOf(":");

      if (separatorIndex <= 0) {
        return [];
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!key) {
        return [];
      }

      return [[key, value] as const];
    });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function buildInitialSelection(tools: DiscoveredMcpTool[]) {
  return tools.map((tool) => tool.name);
}

function buildConnectionPayload(
  form: ConnectionFormState,
): McpConnectionConfig {
  if (form.transportType === "stdio") {
    return {
      transportType: "stdio",
      command: form.command.trim(),
      args: parseCommandArgs(form.commandArgs),
      env: parseStructuredText(form.envText),
    };
  }

  return {
    transportType: form.transportType,
    url: form.url.trim(),
    headers: parseStructuredText(form.headersText),
  };
}

function isConnectionReady(form: ConnectionFormState): boolean {
  if (form.transportType === "stdio") {
    return form.command.trim().length > 0;
  }

  return form.url.trim().length > 0;
}

function getTransportLabel(transportType: McpTransportType): string {
  switch (transportType) {
    case "stdio":
      return "stdio";
    case "sse":
      return "SSE";
    case "streamable_http":
      return "Streamable HTTP";
  }
}

function summarizeInputSchema(inputSchema?: Record<string, unknown>): string {
  if (!inputSchema) {
    return "未提供 inputSchema";
  }

  const schemaType =
    typeof inputSchema.type === "string" ? inputSchema.type : "object";
  const properties = inputSchema.properties;

  if (
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    return `${schemaType} · ${Object.keys(properties).length} 个顶级字段`;
  }

  return schemaType;
}

function formatSchemaPreview(inputSchema?: Record<string, unknown>): string {
  if (!inputSchema) {
    return "未提供 inputSchema";
  }

  return JSON.stringify(inputSchema, null, 2);
}

function formatToolReceiptCount(value: number, label: string): string {
  return `${label} ${value} 个`;
}

function pickSelectedToolNames(
  tools: DiscoveredMcpTool[],
  previousSelection: string[],
): string[] {
  if (previousSelection.length === 0) {
    return buildInitialSelection(tools);
  }

  const availableNames = new Set(tools.map((tool) => tool.name));
  const preserved = previousSelection.filter((toolName) =>
    availableNames.has(toolName),
  );

  return preserved.length > 0 ? preserved : buildInitialSelection(tools);
}

export function McpImportDialog({
  open,
  onOpenChange,
  mode = "import",
  mcpServerConfigId,
  restoreFocusElement,
  serverLabel,
}: McpImportDialogProps) {
  const { notify } = useToast();
  const testMutation = useTestMcpConnection();
  const testSavedConfigMutation = useTestSavedMcpConnection();
  const discoverMutation = useDiscoverMcpTools();
  const importMutation = useImportMcpTools();
  const rediscoverMutation = useRediscoverMcpTools();
  const reimportMutation = useReimportMcpTools();

  const isImportMode = mode === "import";
  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [connectionForm, setConnectionForm] = useState(INITIAL_FORM_STATE);
  const [testResult, setTestResult] = useState<TestMcpConnectionResult | null>(
    null,
  );
  const [discoveryResult, setDiscoveryResult] =
    useState<DiscoverMcpToolsResult | null>(null);
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);
  const [conflictStrategy, setConflictStrategy] =
    useState<McpImportConflictStrategy>("overwrite");
  const [receipt, setReceipt] = useState<ImportMcpToolsResult | null>(null);

  const connectionPayload = useMemo(
    () => buildConnectionPayload(connectionForm),
    [connectionForm],
  );
  const discoveredTools = discoveryResult?.tools ?? [];
  const currentServerInfo: McpServerInfo | undefined =
    testResult?.serverInfo ??
    (discoveryResult?.serverInfo
      ? {
          name: discoveryResult.serverInfo.name,
          version: discoveryResult.serverInfo.version,
        }
      : undefined);
  const canProceedToStepTwo = isImportMode
    ? connectionForm.serverName.trim().length > 0 &&
      isConnectionReady(connectionForm)
    : Boolean(mcpServerConfigId);
  const canProceedToStepThree = Boolean(testResult?.success);
  const hasDiscoveredTools = discoveredTools.length > 0;

  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setConnectionForm(INITIAL_FORM_STATE);
      setTestResult(null);
      setDiscoveryResult(null);
      setSelectedToolNames([]);
      setConflictStrategy("overwrite");
      setReceipt(null);
    }
  }, [open]);

  function resetDownstreamState() {
    setTestResult(null);
    setDiscoveryResult(null);
    setSelectedToolNames([]);
    setReceipt(null);
  }

  function updateConnectionForm(
    patch: Partial<ConnectionFormState>,
    options?: { resetDownstream?: boolean },
  ) {
    setConnectionForm((current) => ({ ...current, ...patch }));

    if (options?.resetDownstream) {
      resetDownstreamState();
    }
  }

  function getSavedConfigIdOrNotify(): string | null {
    if (mcpServerConfigId) {
      return mcpServerConfigId;
    }

    notify({
      title: "缺少服务器配置",
      description: "请从工具库重新打开该条服务器配置的导入流程。",
      variant: "error",
    });

    return null;
  }

  async function handleTestConnection() {
    try {
      if (isImportMode) {
        const result = await testMutation.mutateAsync({
          connection: connectionPayload,
        });

        setTestResult(result);
      } else {
        const savedConfigId = getSavedConfigIdOrNotify();

        if (!savedConfigId) {
          setTestResult(null);
          return;
        }

        const result = await testSavedConfigMutation.mutateAsync(savedConfigId);

        setTestResult(result);
      }
    } catch (error) {
      setTestResult(null);
      setDiscoveryResult(null);
      setSelectedToolNames([]);
      setReceipt(null);
      notify({
        title: "测试连接失败",
        description:
          error instanceof Error ? error.message : "请检查连接信息后重试。",
        variant: "error",
      });
    }
  }

  async function handleDiscover() {
    try {
      const result = isImportMode
        ? await discoverMutation.mutateAsync({
            connection: connectionPayload,
          })
        : await (() => {
            const savedConfigId = getSavedConfigIdOrNotify();

            if (!savedConfigId) {
              throw new Error("缺少保存的 MCP 服务器配置");
            }

            return rediscoverMutation.mutateAsync(savedConfigId);
          })();

      setDiscoveryResult(result);
      setSelectedToolNames((current) =>
        pickSelectedToolNames(result.tools, current),
      );
      setReceipt(null);
    } catch (error) {
      notify({
        title: "发现工具失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
        variant: "error",
      });
    }
  }

  async function handleImport() {
    try {
      const result = isImportMode
        ? await importMutation.mutateAsync({
            serverName: connectionForm.serverName.trim(),
            serverDescription:
              connectionForm.serverDescription.trim() || undefined,
            connection: connectionPayload,
            toolNames: selectedToolNames,
            conflictStrategy,
          })
        : await (() => {
            const savedConfigId = getSavedConfigIdOrNotify();

            if (!savedConfigId) {
              throw new Error("缺少保存的 MCP 服务器配置");
            }

            return reimportMutation.mutateAsync({
              mcpServerConfigId: savedConfigId,
              toolNames: selectedToolNames,
              conflictStrategy,
            });
          })();

      setReceipt(result);
    } catch (error) {
      notify({
        title: isImportMode ? "导入失败" : "重新导入失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
        variant: "error",
      });
    }
  }

  function toggleSelection(toolName: string) {
    setSelectedToolNames((current) =>
      current.includes(toolName)
        ? current.filter((value) => value !== toolName)
        : [...current, toolName],
    );
  }

  function closeDialog() {
    onOpenChange(false);
  }

  const liveMessage = useMemo(() => {
    if (testMutation.isPending || testSavedConfigMutation.isPending) {
      return "正在测试 MCP 连接…";
    }

    if (discoverMutation.isPending || rediscoverMutation.isPending) {
      return "正在发现 MCP 工具…";
    }

    if (importMutation.isPending || reimportMutation.isPending) {
      return "正在提交导入请求…";
    }

    if (receipt) {
      return `${isImportMode ? "导入" : "重新导入"}已完成，可查看回执明细。`;
    }

    return "";
  }, [
    discoverMutation.isPending,
    importMutation.isPending,
    isImportMode,
    receipt,
    rediscoverMutation.isPending,
    reimportMutation.isPending,
    testMutation.isPending,
    testSavedConfigMutation.isPending,
  ]);

  function renderConnectionSummary() {
    if (isImportMode) {
      const auxiliaryValue =
        connectionForm.transportType === "stdio"
          ? `命令 ${connectionForm.command.trim() || "未填写"}${connectionPayload.args?.length ? ` · 参数 ${connectionPayload.args.length} 个` : ""}${connectionPayload.env ? ` · 环境变量 ${Object.keys(connectionPayload.env).length} 项` : ""}`
          : `地址 ${connectionForm.url.trim() || "未填写"}${connectionPayload.headers ? ` · 请求头 ${Object.keys(connectionPayload.headers).length} 项` : ""}`;

      return (
        <dl className="grid gap-3 rounded-2xl border border-border bg-surface p-4 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              服务器
            </dt>
            <dd className="font-medium text-foreground">
              {connectionForm.serverName || "未命名服务器"}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              传输方式
            </dt>
            <dd className="font-medium text-foreground">
              {getTransportLabel(connectionForm.transportType)}
            </dd>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              连接摘要
            </dt>
            <dd className="font-medium text-foreground">{auxiliaryValue}</dd>
          </div>
          {connectionForm.serverDescription.trim() ? (
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                描述
              </dt>
              <dd className="text-muted-foreground">
                {connectionForm.serverDescription.trim()}
              </dd>
            </div>
          ) : null}
        </dl>
      );
    }

    return (
      <dl className="grid gap-3 rounded-2xl border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            已保存服务器
          </dt>
          <dd className="font-medium text-foreground">
            {serverLabel ?? "已保存 MCP 服务器"}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            配置 ID
          </dt>
          <dd className="font-mono text-xs text-foreground">
            {mcpServerConfigId ?? "未提供"}
          </dd>
        </div>
      </dl>
    );
  }

  function renderServerIdentity(serverInfo?: McpServerInfo) {
    if (!serverInfo) {
      return null;
    }

    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
        <p className="font-medium">服务器响应正常</p>
        <p className="mt-1 text-muted-foreground">
          {serverInfo.name} · 版本 {serverInfo.version}
          {serverInfo.protocolVersion
            ? ` · 协议 ${serverInfo.protocolVersion}`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="mcp-import-dialog-description"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,52rem)] w-[min(52rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated text-foreground shadow-2xl"
          onCloseAutoFocus={(event) => {
            if (restoreFocusElement) {
              event.preventDefault();
              restoreFocusElement.focus();
            }
          }}
        >
          <div className="border-b border-border px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Dialog.Title className="text-lg font-semibold">
                  {isImportMode ? "导入 MCP 工具" : "重新导入 MCP 工具"}
                </Dialog.Title>
                <Dialog.Description
                  className="max-w-2xl text-sm text-muted-foreground"
                  id="mcp-import-dialog-description"
                >
                  {isImportMode
                    ? "按四步完成服务器配置、连接测试、工具发现与导入复核，整个会话会保留当前输入上下文。"
                    : `复用${serverLabel ? `“${serverLabel}”` : "已保存 MCP 服务器"}完成连接验证、重新发现与重新导入。`}
                </Dialog.Description>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                  步骤 {currentStep} / 4
                </p>
              </div>

              <Dialog.Close asChild>
                <Button aria-label="关闭导入对话框" variant="outline">
                  关闭
                </Button>
              </Dialog.Close>
            </div>

            <ol
              aria-label="导入步骤"
              className="mt-5 grid gap-3 sm:grid-cols-4"
            >
              {STEP_DEFINITIONS.map((step) => {
                const isActive = step.id === currentStep;
                const isCompleted = step.id < currentStep;

                return (
                  <li
                    className={cn(
                      "rounded-2xl border px-3 py-3 transition-colors",
                      isActive
                        ? "border-primary bg-primary/10"
                        : isCompleted
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-surface",
                    )}
                    key={step.id}
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Step {step.id}
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {step.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p aria-live="polite" className="sr-only">
              {liveMessage}
            </p>

            {currentStep === 1 ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    步骤 1 · 配置连接
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isImportMode
                      ? "先录入服务器名称、传输方式与连接参数。下一步会单独测试连接，不会丢失这里的输入。"
                      : "将使用已保存的服务器配置进入测试与重新发现流程。"}
                  </p>
                </div>

                {isImportMode ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <label
                        className="block text-sm font-medium text-foreground"
                        htmlFor="mcp-server-name"
                      >
                        服务器名称
                      </label>
                      <Input
                        autoComplete="off"
                        id="mcp-server-name"
                        name="serverName"
                        onChange={(event) =>
                          updateConnectionForm({
                            serverName: event.target.value,
                          })
                        }
                        placeholder="例如：Filesystem Server…"
                        spellCheck={false}
                        value={connectionForm.serverName}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label
                        className="block text-sm font-medium text-foreground"
                        htmlFor="mcp-server-description"
                      >
                        服务器描述（可选）
                      </label>
                      <textarea
                        autoComplete="off"
                        className={cn(FIELD_CLASS_NAME, "min-h-24 resize-y")}
                        id="mcp-server-description"
                        name="serverDescription"
                        onChange={(event) =>
                          updateConnectionForm({
                            serverDescription: event.target.value,
                          })
                        }
                        placeholder="说明这组 MCP 工具服务于什么场景…"
                        value={connectionForm.serverDescription}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label
                        className="block text-sm font-medium text-foreground"
                        htmlFor="mcp-transport-type"
                      >
                        传输方式
                      </label>
                      <Select
                        autoComplete="off"
                        name="transportType"
                        onValueChange={(value) =>
                          updateConnectionForm(
                            { transportType: value as McpTransportType },
                            { resetDownstream: true },
                          )
                        }
                        value={connectionForm.transportType}
                      >
                        <SelectTrigger
                          aria-label="传输方式"
                          id="mcp-transport-type"
                        >
                          <SelectValue placeholder="请选择传输方式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stdio">stdio</SelectItem>
                          <SelectItem value="sse">sse</SelectItem>
                          <SelectItem value="streamable_http">
                            streamable_http
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {connectionForm.transportType === "stdio" ? (
                      <>
                        <div className="space-y-2">
                          <label
                            className="block text-sm font-medium text-foreground"
                            htmlFor="mcp-command"
                          >
                            命令
                          </label>
                          <Input
                            autoComplete="off"
                            id="mcp-command"
                            name="command"
                            onChange={(event) =>
                              updateConnectionForm(
                                { command: event.target.value },
                                { resetDownstream: true },
                              )
                            }
                            placeholder="例如：npx…"
                            spellCheck={false}
                            value={connectionForm.command}
                          />
                        </div>

                        <div className="space-y-2">
                          <label
                            className="block text-sm font-medium text-foreground"
                            htmlFor="mcp-command-args"
                          >
                            命令参数
                          </label>
                          <Input
                            autoComplete="off"
                            id="mcp-command-args"
                            name="commandArgs"
                            onChange={(event) =>
                              updateConnectionForm(
                                { commandArgs: event.target.value },
                                { resetDownstream: true },
                              )
                            }
                            placeholder="例如：-y @modelcontextprotocol/server-filesystem…"
                            spellCheck={false}
                            value={connectionForm.commandArgs}
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label
                            className="block text-sm font-medium text-foreground"
                            htmlFor="mcp-env-text"
                          >
                            环境变量（可选）
                          </label>
                          <textarea
                            autoComplete="off"
                            className={cn(
                              FIELD_CLASS_NAME,
                              "min-h-28 resize-y font-mono text-xs",
                            )}
                            id="mcp-env-text"
                            name="envText"
                            onChange={(event) =>
                              updateConnectionForm(
                                { envText: event.target.value },
                                { resetDownstream: true },
                              )
                            }
                            placeholder="API_KEY=demo\nWORKSPACE=/tmp/mcp…"
                            spellCheck={false}
                            value={connectionForm.envText}
                          />
                          <p className="text-xs text-muted-foreground">
                            每行一个 `KEY=value`。
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2 md:col-span-2">
                          <label
                            className="block text-sm font-medium text-foreground"
                            htmlFor="mcp-url"
                          >
                            服务地址
                          </label>
                          <Input
                            autoComplete="off"
                            id="mcp-url"
                            inputMode="url"
                            name="url"
                            onChange={(event) =>
                              updateConnectionForm(
                                { url: event.target.value },
                                { resetDownstream: true },
                              )
                            }
                            placeholder="例如：https://mcp.example.com…"
                            spellCheck={false}
                            type="url"
                            value={connectionForm.url}
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label
                            className="block text-sm font-medium text-foreground"
                            htmlFor="mcp-headers-text"
                          >
                            请求头（可选）
                          </label>
                          <textarea
                            autoComplete="off"
                            className={cn(
                              FIELD_CLASS_NAME,
                              "min-h-28 resize-y font-mono text-xs",
                            )}
                            id="mcp-headers-text"
                            name="headersText"
                            onChange={(event) =>
                              updateConnectionForm(
                                { headersText: event.target.value },
                                { resetDownstream: true },
                              )
                            }
                            placeholder="Authorization=Bearer demo\nX-Workspace=agentloom…"
                            spellCheck={false}
                            value={connectionForm.headersText}
                          />
                          <p className="text-xs text-muted-foreground">
                            每行一个 `Header=value`。
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  renderConnectionSummary()
                )}
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    步骤 2 · 测试连接
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isImportMode
                      ? "这一阶段只验证服务器是否可连接，不会开始发现工具。"
                      : "将复用已保存配置验证服务器可访问性；工具发现仍会在下一步单独执行。"}
                  </p>
                </div>

                {renderConnectionSummary()}

                {renderServerIdentity(testResult?.serverInfo)}
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    步骤 3 · 发现工具
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    先确认服务器当前能发现到哪些工具，并查看 `name / title /
                    description / inputSchema`
                    摘要；下一步再选择具体要导入的工具。
                  </p>
                </div>

                {renderConnectionSummary()}
                {renderServerIdentity(currentServerInfo)}

                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
                  <span>当前已发现 {discoveredTools.length} 个工具</span>
                  <Button
                    disabled={
                      discoverMutation.isPending || rediscoverMutation.isPending
                    }
                    onClick={handleDiscover}
                    variant="outline"
                  >
                    {hasDiscoveredTools ? "重新发现工具" : "发现工具"}
                  </Button>
                </div>

                {hasDiscoveredTools ? (
                  <div className="space-y-3">
                    {discoveredTools.map((tool) => (
                      <div
                        className="rounded-2xl border border-border bg-surface p-4 text-sm transition-colors hover:border-primary/40"
                        key={tool.name}
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                              {tool.title ?? tool.name}
                            </span>
                            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                              {tool.name}
                            </span>
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                              {summarizeInputSchema(tool.inputSchema)}
                            </span>
                          </div>

                          {tool.description ? (
                            <p className="text-muted-foreground">
                              {tool.description}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              这个工具没有提供额外描述。
                            </p>
                          )}

                          <details className="rounded-xl border border-border/80 bg-background/40 px-3 py-2">
                            <summary className="cursor-pointer text-xs font-medium text-foreground">
                              查看 inputSchema 摘要
                            </summary>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                              {formatSchemaPreview(tool.inputSchema)}
                            </pre>
                          </details>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
                    还没有发现工具，先执行一次发现操作。
                  </div>
                )}
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    步骤 4 · 导入并复核
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    在这一步选择要导入的工具、确认冲突策略并提交导入；完成后会在同一步显示回执，无需跳转到第
                    5 步。
                  </p>
                </div>

                {renderConnectionSummary()}
                {renderServerIdentity(currentServerInfo)}

                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      选择要导入的工具
                    </p>
                    <p className="text-sm text-muted-foreground">
                      默认会选中所有已发现工具。提交前你可以取消不需要导入的项。
                    </p>
                  </div>

                  {hasDiscoveredTools ? (
                    <div className="space-y-3">
                      {discoveredTools.map((tool) => {
                        const checked = selectedToolNames.includes(tool.name);
                        const checkboxId = `mcp-tool-${tool.name}`;

                        return (
                          <label
                            className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm transition-colors hover:border-primary/40"
                            htmlFor={checkboxId}
                            key={tool.name}
                          >
                            <input
                              aria-label={tool.title ?? tool.name}
                              checked={checked}
                              className="mt-1 h-4 w-4 rounded border-border"
                              id={checkboxId}
                              onChange={() => toggleSelection(tool.name)}
                              type="checkbox"
                            />

                            <span className="min-w-0 flex-1 space-y-2">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {tool.title ?? tool.name}
                                </span>
                                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                  {tool.name}
                                </span>
                              </span>
                              {tool.description ? (
                                <span className="block text-muted-foreground">
                                  {tool.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
                      还没有发现工具，请先返回上一步完成发现。
                    </div>
                  )}
                </div>

                <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      本次导入摘要
                    </p>
                    <p className="text-sm text-muted-foreground">
                      已选中 {selectedToolNames.length} 个工具，
                      {isImportMode
                        ? "将写入新的服务器配置"
                        : "将复用已保存服务器配置"}
                      。
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {selectedToolNames.map((toolName) => (
                        <span
                          className="rounded-full border border-border px-2 py-1"
                          key={toolName}
                        >
                          {toolName}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      className="block text-sm font-medium text-foreground"
                      htmlFor="mcp-conflict-strategy"
                    >
                      冲突处理策略
                    </label>
                    <Select
                      onValueChange={(value) =>
                        setConflictStrategy(value as McpImportConflictStrategy)
                      }
                      value={conflictStrategy}
                    >
                      <SelectTrigger
                        aria-label="冲突处理策略"
                        id="mcp-conflict-strategy"
                      >
                        <SelectValue placeholder="请选择冲突处理策略" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="overwrite">
                          覆盖已存在工具
                        </SelectItem>
                        <SelectItem value="skip">跳过已存在工具</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {receipt ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-base font-semibold text-foreground">
                        导入回执
                      </h4>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span className="rounded-full border border-border px-3 py-1">
                          {formatToolReceiptCount(
                            receipt.summary.total,
                            "总计处理",
                          )}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          {formatToolReceiptCount(
                            receipt.summary.imported,
                            "已导入",
                          )}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          {formatToolReceiptCount(
                            receipt.summary.overwritten,
                            "已覆盖",
                          )}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          {formatToolReceiptCount(
                            receipt.summary.skipped,
                            "已跳过",
                          )}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          {formatToolReceiptCount(
                            receipt.summary.failed,
                            "失败",
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {receipt.results.map((result) => (
                        <div
                          className="rounded-2xl border border-border bg-surface p-4"
                          key={`${result.toolName}-${result.status}-${result.toolDefinitionId ?? "none"}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {result.title ?? result.toolName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {result.toolName}
                              </p>
                            </div>
                            <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
                              {RECEIPT_STATUS_LABELS[result.status]}
                            </span>
                          </div>

                          {result.description ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {result.description}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {result.toolDefinitionId ? (
                              <span className="rounded-full border border-border px-2 py-1">
                                Tool ID {result.toolDefinitionId}
                              </span>
                            ) : null}
                            {result.portMappingMetadata ? (
                              <span className="rounded-full border border-border px-2 py-1">
                                输入 {result.portMappingMetadata.inputs.length}{" "}
                                · 输出{" "}
                                {result.portMappingMetadata.outputs.length}
                              </span>
                            ) : null}
                            {result.reasonCode ? (
                              <span className="rounded-full border border-border px-2 py-1">
                                {result.reasonCode}
                              </span>
                            ) : null}
                          </div>

                          {result.reasonMessage ? (
                            <p className="mt-3 rounded-xl border border-border/80 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                              {result.reasonMessage}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="border-t border-border px-6 py-4">
            {currentStep === 1 ? (
              <div className="flex justify-end gap-3">
                <Dialog.Close asChild>
                  <Button variant="outline">取消</Button>
                </Dialog.Close>
                <Button
                  disabled={!canProceedToStepTwo}
                  onClick={() => setCurrentStep(2)}
                >
                  继续测试连接
                </Button>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="flex flex-wrap justify-between gap-3">
                <Button onClick={() => setCurrentStep(1)} variant="outline">
                  返回配置连接
                </Button>
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={
                      testMutation.isPending ||
                      testSavedConfigMutation.isPending
                    }
                    onClick={handleTestConnection}
                    variant="outline"
                  >
                    {testMutation.isPending || testSavedConfigMutation.isPending
                      ? "测试中…"
                      : "测试连接"}
                  </Button>
                  <Button
                    disabled={!canProceedToStepThree}
                    onClick={() => setCurrentStep(3)}
                  >
                    继续发现工具
                  </Button>
                </div>
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="flex flex-wrap justify-between gap-3">
                <Button onClick={() => setCurrentStep(2)} variant="outline">
                  返回测试连接
                </Button>
                <Button
                  disabled={!hasDiscoveredTools}
                  onClick={() => setCurrentStep(4)}
                >
                  继续选择导入
                </Button>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="flex flex-wrap justify-between gap-3">
                <Button onClick={() => setCurrentStep(3)} variant="outline">
                  返回发现工具
                </Button>
                <div className="flex flex-wrap gap-3">
                  {receipt ? (
                    <Button onClick={closeDialog}>完成</Button>
                  ) : (
                    <Button
                      disabled={
                        selectedToolNames.length === 0 ||
                        importMutation.isPending ||
                        reimportMutation.isPending
                      }
                      onClick={handleImport}
                    >
                      {importMutation.isPending || reimportMutation.isPending
                        ? isImportMode
                          ? "导入中…"
                          : "重新导入中…"
                        : isImportMode
                          ? "开始导入"
                          : "开始重新导入"}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
