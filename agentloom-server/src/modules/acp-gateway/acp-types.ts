import type { StopReason } from '../agent/types/agent-event.types';
import type {
  ContentBlock,
} from '../agent/types/content-block.types';
import type {
  SessionContext,
  ServerSandboxBinding,
} from '../agent/types/agent-session.types';
import type {
  ToolCallEvent,
  ToolPermissionRequest,
  ToolCallStatus,
} from '../agent/types/tool-call-event.types';
import type { JsonRpcId, JsonRpcNotification } from './acp-jsonrpc';

export interface AcpServerCapabilities {
  loadSession: true;
  streaming: true;
  tools: true;
  fs?: {
    readTextFile: boolean;
    writeTextFile: boolean;
  };
  terminal?: {
    create: boolean;
  };
  mcpServers?: true;
}

export interface AcpClientRootsCapability {
  listChanged?: boolean;
  [key: string]: unknown;
}

export interface AcpClientCapabilities {
  roots?: AcpClientRootsCapability;
  fs?: {
    readTextFile: boolean;
    writeTextFile: boolean;
  };
  terminal?: {
    create: boolean;
    output: boolean;
  };
  mcpServers?: true;
  [key: string]: unknown;
}

export interface AcpServerInfo {
  name: string;
  version: string;
  capabilities: AcpServerCapabilities;
}

export interface AcpInitializeResult {
  protocolVersion: string;
  serverInfo: AcpServerInfo;
}

export interface AcpAuthContext {
  userId: string;
  email: string;
  tenantId?: string;
  tenantRole?: string;
  orgId?: string;
  authMethod: 'jwt';
}

export interface AcpTrackedSession {
  sessionId: string;
  runtimeSessionId: string;
  agentId: string;
  tenantId: string;
  cwd?: SessionContext['cwd'];
  serverSandbox?: ServerSandboxBinding;
  activePromptRequestId?: JsonRpcId;
  pendingPermissionRequestId?: JsonRpcId;
  pendingPermissionToolCallId?: string;
  pendingFsRequestIds?: JsonRpcId[];
  terminalIds?: string[];
}

export type AcpFilesystemMode = 'client_proxy' | 'server_sandbox';

export type AcpTerminalMode = 'server_sandbox';

export interface AcpReadTextFileParams {
  sessionId: string;
  path: string;
  mode: AcpFilesystemMode;
}

export interface AcpReadTextFileResult {
  content: ContentBlock[];
}

export interface AcpWriteTextFileParams {
  sessionId: string;
  path: string;
  content: string;
  mode: AcpFilesystemMode;
}

export interface AcpWriteTextFileResult {
  success: true;
}

export interface AcpTerminalCreateParams {
  sessionId: string;
  command: string;
  args?: string[];
  cwd?: string;
  mode?: AcpTerminalMode;
  outputByteLimit?: number;
}

export interface AcpTerminalCreateResult {
  terminalId: string;
}

export interface AcpTerminalOutputParams {
  sessionId: string;
  terminalId: string;
  offset?: number;
  outputByteLimit?: number;
}

export interface AcpTerminalOutputResult {
  terminalId: string;
  output: string;
  nextOffset?: number;
  truncated: boolean;
}

export interface AcpTerminalWaitForExitParams {
  sessionId: string;
  terminalId: string;
  timeoutMs?: number;
}

export interface AcpTerminalWaitForExitResult {
  terminalId: string;
  status: 'running' | 'exited' | 'killed' | 'released';
  exitCode?: number | null;
  signal?: string | null;
}

export interface AcpTerminalKillParams {
  sessionId: string;
  terminalId: string;
}

export interface AcpTerminalKillResult {
  success: true;
}

export interface AcpTerminalReleaseParams {
  sessionId: string;
  terminalId: string;
}

export interface AcpTerminalReleaseResult {
  success: true;
}

export interface AcpSessionNewParams {
  agentId: string;
  cwd?: SessionContext['cwd'];
  mcpServers?: SessionContext['mcpServers'];
  serverSandbox?: ServerSandboxBinding;
}

export interface AcpSessionNewResult {
  sessionId: string;
}

export interface AcpSessionPromptParams {
  sessionId: string;
  content: ContentBlock[];
}

export interface AcpSessionLoadParams {
  sessionId: string;
}

export interface AcpSessionLoadResult {
  sessionId: string;
}

export type AcpSessionStopReason = StopReason;

export interface AcpSessionPromptResult {
  stopReason: AcpSessionStopReason;
}

export interface AcpSessionCancelParams {
  sessionId: string;
}

export type AcpPermissionOptionKind =
  | 'allow_once'
  | 'allow_always'
  | 'reject_once'
  | 'reject_always';

export interface AcpPermissionOption {
  optionId: string;
  name: string;
  kind: AcpPermissionOptionKind;
}

export interface AcpPermissionToolCall {
  toolCallId: string;
  title?: string;
  kind: 'tool_call';
  status: Extract<ToolCallStatus, 'awaiting_permission'>;
  content?: ContentBlock[];
  permissionRequest?: Pick<ToolPermissionRequest, 'description' | 'resourcePaths'>;
}

export interface AcpPermissionSelectedOutcome {
  outcome: 'selected';
  optionId: string;
}

export interface AcpPermissionCancelledOutcome {
  outcome: 'cancelled';
}

export type AcpPermissionOutcome =
  | AcpPermissionSelectedOutcome
  | AcpPermissionCancelledOutcome;

export interface AcpSessionRequestPermissionParams {
  sessionId: string;
  toolCall: AcpPermissionToolCall;
  options: AcpPermissionOption[];
}

export interface AcpSessionRequestPermissionResult {
  outcome: AcpPermissionOutcome;
}

export interface AcpSessionUpdateBase {
  replayed?: true;
}

export interface AcpPlanUpdate extends AcpSessionUpdateBase {
  type: 'plan';
  title: string;
  content: string;
}

export interface AcpUserMessageUpdate extends AcpSessionUpdateBase {
  type: 'user_message';
  content: ContentBlock[];
}

export interface AcpAgentMessageChunkUpdate extends AcpSessionUpdateBase {
  type: 'agent_message_chunk';
  content: string;
}

export interface AcpToolCallUpdate extends AcpSessionUpdateBase {
  type: 'tool_call';
  call: ToolCallEvent;
}

export interface AcpDecisionUpdate extends AcpSessionUpdateBase {
  type: 'decision';
  suggestedContent: string;
  autonomyMode?: string;
  selectedAction?: string;
  alternatives?: readonly string[];
  confidence?: number;
  rationale?: string;
}

export type AcpSessionUpdate =
  | AcpPlanUpdate
  | AcpUserMessageUpdate
  | AcpAgentMessageChunkUpdate
  | AcpToolCallUpdate
  | AcpDecisionUpdate;

export interface AcpSessionUpdateNotificationParams {
  sessionId: string;
  update: AcpSessionUpdate;
}

export interface AcpConnectionState {
  initialized: boolean;
  clientCapabilities?: AcpClientCapabilities;
  negotiatedProtocolVersion?: string;
  authContext?: AcpAuthContext;
  initializedNotificationReceived?: boolean;
  sessions?: Map<string, AcpTrackedSession>;
  emitNotification?: (
    notification: JsonRpcNotification<AcpSessionUpdateNotificationParams>,
  ) => Promise<void>;
  requestClient?: <TParams, TResult>(
    method: string,
    params: TParams,
  ) => {
    requestId: JsonRpcId;
    response: Promise<TResult>;
  };
  cancelClientRequest?: <TResult>(
    requestId: JsonRpcId,
    result: TResult,
  ) => boolean;
}
