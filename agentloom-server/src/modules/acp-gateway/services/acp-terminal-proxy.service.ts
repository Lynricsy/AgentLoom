import { randomUUID } from 'node:crypto';
import { posix as pathPosix } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import type {
  AgentSession,
  TerminalContinuityEntry,
  TerminalContinuityState,
} from '../../agent/types/agent-session.types';
import { AuditLogService } from '../../evidence/audit-log.service';
import { SessionPersistenceService } from '../../execution/services/session-persistence.service';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { resolveAcpAgentRuntime } from '../resolve-acp-agent-runtime';
import type {
  AcpTerminalCreateParams,
  AcpTerminalCreateResult,
  AcpTerminalKillParams,
  AcpTerminalKillResult,
  AcpTerminalOutputParams,
  AcpTerminalOutputResult,
  AcpTerminalReleaseParams,
  AcpTerminalReleaseResult,
  AcpTerminalWaitForExitParams,
  AcpTerminalWaitForExitResult,
  AcpTrackedSession,
} from '../acp-types';
import { AcpTerminalSandboxService } from './acp-terminal-sandbox.service';

const DEFAULT_OUTPUT_BYTE_LIMIT = 1024 * 1024;
const MAX_CONCURRENT_TERMINALS_PER_SESSION = 5;
const DEFAULT_TERMINAL_KILL_SIGNAL = 'TERM';
const ACP_SANDBOX_WORKSPACE_ROOT = '/workspace';
const DEFAULT_TERMINAL_TIMEOUT_MS = (() => {
  const configuredTimeout = Number.parseInt(
    process.env.ACP_TEST_TERMINAL_TIMEOUT_MS ?? '',
    10,
  );

  if (Number.isInteger(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout;
  }

  return 300_000;
})();
const BLOCKED_COMMANDS = new Set([
  'bash',
  'sh',
  'zsh',
  'fish',
  'sudo',
  'su',
  'docker',
  'kubectl',
]);
const SHELL_INJECTION_PATTERN = /(?:&&|\|\||;|\$\(|`|\r|\n)/;
const RECURSIVE_REMOVE_FLAGS = new Set([
  '-r',
  '-rf',
  '-fr',
  '--recursive',
  '--no-preserve-root',
]);

type TerminalLifecycleStatus = 'running' | 'exited' | 'killed' | 'released';

interface TerminalRecord {
  readonly terminalId: string;
  readonly sessionId: string;
  readonly tenantId: string;
  readonly execId: string;
  readonly cwd: string;
  readonly outputByteLimit: number;
  status: TerminalLifecycleStatus;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  timeoutHandle: NodeJS.Timeout | null;
  buffer: Buffer;
  earliestOffset: number;
  nextOffset: number;
}

@Injectable()
export class AcpTerminalProxyService {
  private readonly terminalRegistry = new Map<string, TerminalRecord>();
  private agentRuntime?: IAgentRuntime;

  constructor(
    private readonly auditLogService?: AuditLogService,
    private readonly sandboxTerminalService?: AcpTerminalSandboxService,
    private readonly moduleRef?: ModuleRef,
    private readonly sessionPersistence?: SessionPersistenceService,
  ) {}

  async createTerminal(
    params: Omit<AcpTerminalCreateParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
  ): Promise<AcpTerminalCreateResult> {
    this.ensureSandboxMode(params.mode);
    const previousTerminalIds = trackedSession.terminalIds
      ? [...trackedSession.terminalIds]
      : undefined;

    try {
      this.ensureCreateRequestAllowed(params, trackedSession);
    } catch (error) {
      if (error instanceof AcpJsonRpcError) {
        await this.recordSandboxRejection(trackedSession, params, error);
      }

      throw error;
    }

    this.ensureSessionTerminalLimit(trackedSession);

    let createdTerminal: { execId: string; cwd: string } | null = null;
    let createdRecord: TerminalRecord | null = null;

    try {
      createdTerminal = await this.getSandboxTerminalService().createTerminal({
        trackedSession,
        command: params.command,
        args: params.args,
        cwd: params.cwd,
      });
      const terminalId = randomUUID();
      const record: TerminalRecord = {
        terminalId,
        sessionId: trackedSession.sessionId,
        tenantId: trackedSession.tenantId,
        execId: createdTerminal.execId,
        cwd: createdTerminal.cwd,
        outputByteLimit: params.outputByteLimit ?? DEFAULT_OUTPUT_BYTE_LIMIT,
        status: 'running',
        exitCode: null,
        signal: null,
        timedOut: false,
        timeoutHandle: null,
        buffer: Buffer.alloc(0),
        earliestOffset: 0,
        nextOffset: 0,
      };
      createdRecord = record;

      await this.getSandboxTerminalService().attachOutput(
        createdTerminal.execId,
        (_stream, chunk) => {
          this.appendOutput(record, chunk);
        },
      );

      this.terminalRegistry.set(terminalId, record);
      trackedSession.terminalIds = [
        ...(trackedSession.terminalIds ?? []),
        terminalId,
      ];
      record.timeoutHandle = this.scheduleTerminalTimeout(
        record,
        trackedSession,
      );
      await this.persistTerminalContinuity(trackedSession);

      return { terminalId };
    } catch (error) {
      if (createdRecord) {
        this.rollbackCreatedTerminal(
          trackedSession,
          createdRecord,
          previousTerminalIds,
        );
      }

      if (createdTerminal) {
        await this.safeKill(
          createdTerminal.execId,
          DEFAULT_TERMINAL_KILL_SIGNAL,
        );
      }

      if (
        error instanceof AcpJsonRpcError &&
        this.shouldRecordCreateRejection(error)
      ) {
        await this.recordSandboxRejection(trackedSession, params, error);
        throw error;
      }

      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw new AcpJsonRpcError(-32603, 'ACP terminal creation failed');
    }
  }

  async readTerminalOutput(
    params: Omit<AcpTerminalOutputParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
  ): Promise<AcpTerminalOutputResult> {
    const terminal = this.getTrackedTerminal(params.terminalId, trackedSession);

    if (terminal.status !== 'running') {
      throw new AcpJsonRpcError(
        -32004,
        'ACP terminal output is unavailable because terminal is not running',
        {
          reason: 'terminal_output_unavailable',
          status: terminal.status,
          terminalId: terminal.terminalId,
        },
      );
    }

    const offset = params.offset;

    if (typeof offset === 'number' && offset > terminal.nextOffset) {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        reason: 'terminal_output_offset_invalid',
      });
    }

    if (typeof offset === 'number' && offset < terminal.earliestOffset) {
      throw new AcpJsonRpcError(
        -32004,
        'ACP terminal output offset has been truncated',
        {
          reason: 'terminal_output_offset_trimmed',
        },
      );
    }

    const effectiveOffset = offset ?? terminal.earliestOffset;
    const relativeOffset = Math.max(
      0,
      effectiveOffset - terminal.earliestOffset,
    );
    const outputByteLimit = params.outputByteLimit ?? terminal.outputByteLimit;
    const boundedBuffer = terminal.buffer.subarray(
      relativeOffset,
      Math.min(terminal.buffer.length, relativeOffset + outputByteLimit),
    );
    const output = boundedBuffer.toString('utf8');

    return {
      terminalId: terminal.terminalId,
      output,
      nextOffset: effectiveOffset + boundedBuffer.length,
      truncated: terminal.earliestOffset > 0,
    };
  }

  async waitForTerminalExit(
    params: Omit<AcpTerminalWaitForExitParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
  ): Promise<AcpTerminalWaitForExitResult> {
    const terminal = this.getTrackedTerminal(params.terminalId, trackedSession);

    if (terminal.status === 'released') {
      return this.buildWaitResult(terminal);
    }

    if (terminal.status !== 'running') {
      this.throwIfTerminalTimedOut(terminal);
      return this.buildWaitResult(terminal);
    }

    const exitInfo = await this.waitForExitWithOptionalTimeout(
      terminal.execId,
      params.timeoutMs,
    );

    if (!exitInfo.running) {
      this.clearTerminalTimeout(terminal);
      terminal.exitCode = exitInfo.exitCode ?? null;

      if (this.isKilledTerminal(terminal)) {
        terminal.signal = terminal.signal ?? DEFAULT_TERMINAL_KILL_SIGNAL;
      } else {
        terminal.status = 'exited';
        terminal.signal = null;
      }

      await this.persistTerminalContinuity(trackedSession);
    }

    this.throwIfTerminalTimedOut(terminal);

    return this.buildWaitResult(terminal);
  }

  async killTerminal(
    params: Omit<AcpTerminalKillParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
  ): Promise<AcpTerminalKillResult> {
    const terminal = this.getTrackedTerminal(params.terminalId, trackedSession);

    if (terminal.status === 'running') {
      await this.getSandboxTerminalService().killTerminal(
        terminal.execId,
        DEFAULT_TERMINAL_KILL_SIGNAL,
      );
      this.clearTerminalTimeout(terminal);
      terminal.status = 'killed';
      terminal.signal = DEFAULT_TERMINAL_KILL_SIGNAL;
      await this.recordTerminalKilledAudit(
        trackedSession,
        terminal,
        'manual_kill',
      );
      await this.persistTerminalContinuity(trackedSession);
    }

    return { success: true };
  }

  async releaseTerminal(
    params: Omit<AcpTerminalReleaseParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
  ): Promise<AcpTerminalReleaseResult> {
    const terminal = this.getTrackedTerminal(params.terminalId, trackedSession);
    await this.releaseTerminalRecord(
      terminal,
      trackedSession,
      'terminal_release',
    );
    this.removeTrackedTerminalId(trackedSession, terminal.terminalId);
    await this.persistTerminalContinuity(trackedSession);
    return { success: true };
  }

  async cleanupSessionTerminals(
    trackedSession: AcpTrackedSession,
  ): Promise<void> {
    const terminalIds = new Set<string>([
      ...(trackedSession.terminalIds ?? []),
      ...this.getSessionTerminalRecords(trackedSession).map(
        (terminal) => terminal.terminalId,
      ),
    ]);

    for (const terminalId of terminalIds) {
      const terminal = this.terminalRegistry.get(terminalId);
      if (
        !terminal ||
        terminal.sessionId !== trackedSession.sessionId ||
        terminal.tenantId !== trackedSession.tenantId
      ) {
        continue;
      }

      await this.releaseTerminalRecord(
        terminal,
        trackedSession,
        'session_cleanup',
      );
    }

    trackedSession.terminalIds = [];
    await this.persistTerminalContinuity(trackedSession);
  }

  async restoreTerminalContinuity(
    trackedSession: AcpTrackedSession,
    continuity: TerminalContinuityState,
  ): Promise<string[]> {
    const reboundTerminalIds: string[] = [];

    for (const continuityEntry of continuity.terminals) {
      const terminal = this.terminalRegistry.get(continuityEntry.terminalId);

      if (
        !terminal ||
        terminal.sessionId !== trackedSession.sessionId ||
        terminal.tenantId !== trackedSession.tenantId ||
        terminal.execId !== continuityEntry.execId ||
        terminal.cwd !== continuityEntry.cwd ||
        terminal.outputByteLimit !== continuityEntry.outputByteLimit ||
        terminal.status !== continuityEntry.status ||
        terminal.exitCode !== (continuityEntry.exitCode ?? null) ||
        terminal.signal !== (continuityEntry.signal ?? null)
      ) {
        throw this.buildTerminalContinuityUnavailableError(
          trackedSession.sessionId,
        );
      }

      reboundTerminalIds.push(terminal.terminalId);
    }

    trackedSession.terminalIds = reboundTerminalIds;
    return reboundTerminalIds;
  }

  private ensureSandboxMode(mode: AcpTerminalCreateParams['mode']) {
    if (typeof mode === 'undefined' || mode === 'server_sandbox') {
      return;
    }

    throw new AcpJsonRpcError(-32602, 'Invalid params');
  }

  private ensureCreateRequestAllowed(
    params: Omit<AcpTerminalCreateParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
  ) {
    this.ensureCommandAllowed(params.command);
    this.ensureCommandPatternsAllowed(
      params.command,
      params.args,
      trackedSession,
    );
    this.ensureCwdAllowed(params.cwd, trackedSession);
  }

  private ensureCommandAllowed(command: string) {
    const normalizedCommand = this.normalizeCommandName(command);

    if (!BLOCKED_COMMANDS.has(normalizedCommand)) {
      return;
    }

    throw new AcpJsonRpcError(
      -32004,
      'ACP terminal command is not allowed by sandbox policy',
      { reason: 'terminal_command_not_allowed' },
    );
  }

  private ensureCommandPatternsAllowed(
    command: string,
    args: string[] | undefined,
    trackedSession: AcpTrackedSession,
  ) {
    const normalizedCommand = this.normalizeCommandName(command);
    const commandAndArgs = [command, ...(args ?? [])];
    const sandboxBaseCwd = trackedSession.cwd ?? ACP_SANDBOX_WORKSPACE_ROOT;

    if (commandAndArgs.some((value) => SHELL_INJECTION_PATTERN.test(value))) {
      throw new AcpJsonRpcError(
        -32004,
        'ACP terminal command is not allowed by sandbox policy',
        { reason: 'terminal_command_pattern_not_allowed' },
      );
    }

    const normalizedArgs = args ?? [];
    const hasRecursiveRemoveFlag = normalizedArgs.some((value) =>
      RECURSIVE_REMOVE_FLAGS.has(value.toLowerCase()),
    );

    if (
      normalizedCommand === 'rm' &&
      hasRecursiveRemoveFlag &&
      normalizedArgs.some((value) =>
        this.isDangerousRemoveTarget(value, trackedSession),
      )
    ) {
      throw new AcpJsonRpcError(
        -32004,
        'ACP terminal command is not allowed by sandbox policy',
        { reason: 'terminal_command_pattern_not_allowed' },
      );
    }

    for (const value of normalizedArgs) {
      const pathCandidate = this.extractPathArgumentCandidate(value);
      if (!pathCandidate) {
        continue;
      }

      const resolvedPath = this.resolveSandboxPath(
        pathCandidate,
        sandboxBaseCwd,
      );
      if (!this.isWithinWorkspace(resolvedPath)) {
        throw new AcpJsonRpcError(
          -32004,
          'ACP terminal command is not allowed by sandbox policy',
          { reason: 'terminal_command_pattern_not_allowed' },
        );
      }
    }
  }

  private ensureCwdAllowed(
    cwd: string | undefined,
    trackedSession: AcpTrackedSession,
  ) {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      return;
    }

    const sandboxBaseCwd = trackedSession.cwd ?? ACP_SANDBOX_WORKSPACE_ROOT;
    const resolvedPath = this.resolveSandboxPath(cwd, sandboxBaseCwd);
    if (this.isWithinWorkspace(resolvedPath)) {
      return;
    }

    throw new AcpJsonRpcError(-32004, 'ACP terminal cwd escapes workspace', {
      reason: 'terminal_cwd_escaped_workspace',
    });
  }

  private ensureSessionTerminalLimit(trackedSession: AcpTrackedSession) {
    const runningTerminalCount = [...this.terminalRegistry.values()].filter(
      (entry) =>
        entry.sessionId === trackedSession.sessionId &&
        entry.status === 'running',
    ).length;

    if (runningTerminalCount < MAX_CONCURRENT_TERMINALS_PER_SESSION) {
      return;
    }

    throw new AcpJsonRpcError(-32004, 'ACP terminal session limit exceeded', {
      reason: 'terminal_session_limit_exceeded',
    });
  }

  private appendOutput(record: TerminalRecord, chunk: string) {
    const chunkBuffer = Buffer.from(chunk, 'utf8');
    const combinedBuffer = Buffer.concat([record.buffer, chunkBuffer]);
    record.nextOffset += chunkBuffer.length;

    if (combinedBuffer.length <= record.outputByteLimit) {
      record.buffer = combinedBuffer;
      record.earliestOffset = record.nextOffset - record.buffer.length;
      return;
    }

    const desiredStart = combinedBuffer.length - record.outputByteLimit;
    const safeStart = this.alignUtf8Start(combinedBuffer, desiredStart);
    record.buffer = combinedBuffer.subarray(safeStart);
    record.earliestOffset = record.nextOffset - record.buffer.length;
  }

  private alignUtf8Start(buffer: Buffer, start: number): number {
    let index = Math.max(0, Math.min(start, buffer.length));

    while (
      index < buffer.length &&
      (buffer[index] & 0b1100_0000) === 0b1000_0000
    ) {
      index += 1;
    }

    return index;
  }

  private getTrackedTerminal(
    terminalId: string,
    trackedSession: AcpTrackedSession,
  ): TerminalRecord {
    const terminal = this.terminalRegistry.get(terminalId);

    if (
      !terminal ||
      terminal.sessionId !== trackedSession.sessionId ||
      terminal.tenantId !== trackedSession.tenantId
    ) {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        reason: 'terminal_not_found',
        terminalId,
      });
    }

    return terminal;
  }

  private async waitForExitWithOptionalTimeout(
    execId: string,
    timeoutMs: number | undefined,
  ) {
    if (typeof timeoutMs !== 'number') {
      return this.getSandboxTerminalService().waitForExit(execId);
    }

    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      return await Promise.race([
        this.getSandboxTerminalService().waitForExit(execId),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new AcpJsonRpcError(-32004, 'ACP terminal wait timed out', {
                reason: 'terminal_wait_timeout',
                timeoutMs,
              }),
            );
          }, timeoutMs);

          timeoutHandle.unref?.();
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private throwIfTerminalTimedOut(terminal: TerminalRecord): void {
    if (!terminal.timedOut) {
      return;
    }

    throw new AcpJsonRpcError(-32004, 'ACP terminal execution timed out', {
      reason: 'terminal_timeout',
      terminalId: terminal.terminalId,
      signal: terminal.signal ?? DEFAULT_TERMINAL_KILL_SIGNAL,
    });
  }

  private buildWaitResult(
    terminal: TerminalRecord,
  ): AcpTerminalWaitForExitResult {
    return {
      terminalId: terminal.terminalId,
      status: terminal.status,
      ...(terminal.exitCode === null ? {} : { exitCode: terminal.exitCode }),
      signal: terminal.signal ?? null,
    };
  }

  private isKilledTerminal(terminal: TerminalRecord): boolean {
    return terminal.status === 'killed';
  }

  private getSessionTerminalRecords(
    trackedSession: AcpTrackedSession,
  ): TerminalRecord[] {
    return [...this.terminalRegistry.values()].filter(
      (terminal) =>
        terminal.sessionId === trackedSession.sessionId &&
        terminal.tenantId === trackedSession.tenantId,
    );
  }

  private rollbackCreatedTerminal(
    trackedSession: AcpTrackedSession,
    terminal: TerminalRecord,
    previousTerminalIds: string[] | undefined,
  ): void {
    this.clearTerminalTimeout(terminal);
    this.terminalRegistry.delete(terminal.terminalId);
    trackedSession.terminalIds = previousTerminalIds
      ? [...previousTerminalIds]
      : undefined;
  }

  private async releaseTerminalRecord(
    terminal: TerminalRecord,
    trackedSession: AcpTrackedSession,
    reason: 'terminal_release' | 'session_cleanup',
  ): Promise<void> {
    if (terminal.status === 'running') {
      await this.getSandboxTerminalService().killTerminal(
        terminal.execId,
        DEFAULT_TERMINAL_KILL_SIGNAL,
      );
      terminal.status = 'killed';
      terminal.signal = DEFAULT_TERMINAL_KILL_SIGNAL;
      await this.recordTerminalKilledAudit(trackedSession, terminal, reason);
    }

    this.clearTerminalTimeout(terminal);
    this.terminalRegistry.delete(terminal.terminalId);
  }

  private removeTrackedTerminalId(
    trackedSession: AcpTrackedSession,
    terminalId: string,
  ) {
    trackedSession.terminalIds = (trackedSession.terminalIds ?? []).filter(
      (currentTerminalId) => currentTerminalId !== terminalId,
    );
  }

  private shouldRecordCreateRejection(error: AcpJsonRpcError): boolean {
    return error.code === -32004;
  }

  private scheduleTerminalTimeout(
    terminal: TerminalRecord,
    trackedSession: AcpTrackedSession,
  ): NodeJS.Timeout {
    const timeoutHandle = setTimeout(() => {
      void this.handleTerminalTimeout(terminal.terminalId, trackedSession);
    }, DEFAULT_TERMINAL_TIMEOUT_MS);

    timeoutHandle.unref?.();
    return timeoutHandle;
  }

  private clearTerminalTimeout(terminal: TerminalRecord): void {
    if (!terminal.timeoutHandle) {
      return;
    }

    clearTimeout(terminal.timeoutHandle);
    terminal.timeoutHandle = null;
  }

  private async handleTerminalTimeout(
    terminalId: string,
    trackedSession: AcpTrackedSession,
  ): Promise<void> {
    const terminal = this.terminalRegistry.get(terminalId);

    if (
      !terminal ||
      terminal.sessionId !== trackedSession.sessionId ||
      terminal.tenantId !== trackedSession.tenantId ||
      terminal.status !== 'running'
    ) {
      return;
    }

    terminal.timeoutHandle = null;

    try {
      await this.getSandboxTerminalService().killTerminal(
        terminal.execId,
        DEFAULT_TERMINAL_KILL_SIGNAL,
      );
      terminal.status = 'killed';
      terminal.signal = DEFAULT_TERMINAL_KILL_SIGNAL;
      terminal.timedOut = true;
      await this.recordAudit(
        trackedSession,
        'acp.terminal.server_sandbox.timed_out',
        {
          summary: 'Timed out ACP server_sandbox terminal',
          metadata: {
            terminalId: terminal.terminalId,
            execId: terminal.execId,
            timeoutMs: DEFAULT_TERMINAL_TIMEOUT_MS,
          },
        },
      );
      await this.persistTerminalContinuity(trackedSession);
    } catch {
      return;
    }
  }

  private isDangerousRemoveTarget(
    value: string,
    trackedSession: AcpTrackedSession,
  ): boolean {
    if (
      value === '/' ||
      value === '.' ||
      value === '..' ||
      value.startsWith('~')
    ) {
      return true;
    }

    const pathCandidate = this.extractPathArgumentCandidate(value);
    if (!pathCandidate) {
      return false;
    }

    const sandboxBaseCwd = trackedSession.cwd ?? ACP_SANDBOX_WORKSPACE_ROOT;
    const resolvedPath = this.resolveSandboxPath(pathCandidate, sandboxBaseCwd);
    return (
      !this.isWithinWorkspace(resolvedPath) ||
      resolvedPath === ACP_SANDBOX_WORKSPACE_ROOT
    );
  }

  private normalizeCommandName(command: string): string {
    return pathPosix.basename(command.replaceAll('\\', '/')).toLowerCase();
  }

  private extractPathArgumentCandidate(value: string): string | null {
    const normalizedValue = value.trim();
    if (this.isLikelyPathValue(normalizedValue)) {
      return normalizedValue;
    }

    const assignmentSeparatorIndex = normalizedValue.indexOf('=');
    if (assignmentSeparatorIndex <= 0) {
      return null;
    }

    const flagName = normalizedValue.slice(0, assignmentSeparatorIndex);
    const assignedValue = normalizedValue
      .slice(assignmentSeparatorIndex + 1)
      .trim();

    if (!flagName.startsWith('-') || assignedValue.length === 0) {
      return null;
    }

    return this.isLikelyPathValue(assignedValue) ? assignedValue : null;
  }

  private isLikelyPathValue(value: string): boolean {
    return (
      value === '.' ||
      value === '..' ||
      value.startsWith('/') ||
      value.startsWith('./') ||
      value.startsWith('../') ||
      value.startsWith('.\\') ||
      value.startsWith('..\\') ||
      value.startsWith('~')
    );
  }

  private resolveSandboxPath(value: string, sessionCwd: string): string {
    const normalizedValue = value.replaceAll('\\', '/');

    if (normalizedValue.startsWith('~')) {
      return normalizedValue;
    }

    if (normalizedValue.startsWith('/')) {
      return pathPosix.normalize(normalizedValue);
    }

    return pathPosix.resolve(sessionCwd, normalizedValue);
  }

  private isWithinWorkspace(resolvedPath: string): boolean {
    return (
      resolvedPath === ACP_SANDBOX_WORKSPACE_ROOT ||
      resolvedPath.startsWith(`${ACP_SANDBOX_WORKSPACE_ROOT}/`)
    );
  }

  private getAgentRuntime(): IAgentRuntime {
    if (!this.moduleRef) {
      throw new AcpJsonRpcError(
        -32603,
        'ACP terminal continuity persistence is unavailable',
        { reason: 'terminal_continuity_persistence_unavailable' },
      );
    }

    if (!this.agentRuntime) {
      this.agentRuntime = resolveAcpAgentRuntime(this.moduleRef);
    }

    return this.agentRuntime;
  }

  private getSessionPersistence(): SessionPersistenceService {
    if (!this.sessionPersistence) {
      throw new AcpJsonRpcError(
        -32603,
        'ACP terminal continuity persistence is unavailable',
        { reason: 'terminal_continuity_persistence_unavailable' },
      );
    }

    return this.sessionPersistence;
  }

  private async loadConversationRuntimeSession(
    trackedSession: AcpTrackedSession,
  ): Promise<AgentSession> {
    const session = await this.getAgentRuntime().loadSession(
      trackedSession.sessionId,
    );

    if (
      session.mode !== 'conversation' ||
      session.tenantId !== trackedSession.tenantId
    ) {
      throw this.buildTerminalContinuityUnavailableError(
        trackedSession.sessionId,
      );
    }

    return session;
  }

  private async persistTerminalContinuity(
    trackedSession: AcpTrackedSession,
  ): Promise<void> {
    const session = await this.loadConversationRuntimeSession(trackedSession);
    const previousTerminalContinuity = session.context.terminalContinuity;
    const previousUpdatedAt = session.updatedAt;
    session.context.terminalContinuity = {
      terminals: this.getSessionTerminalRecords(trackedSession).map(
        (terminal) => this.toContinuityEntry(terminal),
      ),
    };
    session.updatedAt = new Date();

    try {
      await this.getSessionPersistence().saveConversationSession(session);
    } catch (error) {
      if (typeof previousTerminalContinuity === 'undefined') {
        delete session.context.terminalContinuity;
      } else {
        session.context.terminalContinuity = previousTerminalContinuity;
      }
      session.updatedAt = previousUpdatedAt;
      throw error;
    }
  }

  private toContinuityEntry(terminal: TerminalRecord): TerminalContinuityEntry {
    return {
      terminalId: terminal.terminalId,
      execId: terminal.execId,
      cwd: terminal.cwd,
      outputByteLimit: terminal.outputByteLimit,
      status: terminal.status,
      ...(terminal.exitCode === null ? {} : { exitCode: terminal.exitCode }),
      signal: terminal.signal ?? null,
    };
  }

  private buildTerminalContinuityUnavailableError(
    sessionId: string,
  ): AcpJsonRpcError {
    return new AcpJsonRpcError(
      -32603,
      'Failed to restore ACP terminal continuity',
      {
        sessionId,
        reason: 'terminal_continuity_unavailable',
      },
    );
  }

  private getSandboxTerminalService(): AcpTerminalSandboxService {
    if (!this.sandboxTerminalService) {
      throw new AcpJsonRpcError(
        -32603,
        'ACP server sandbox terminal service is unavailable',
        { reason: 'sandbox_service_unavailable' },
      );
    }

    return this.sandboxTerminalService;
  }

  private async safeKill(execId: string, signal: string): Promise<void> {
    try {
      await this.getSandboxTerminalService().killTerminal(execId, signal);
    } catch {
      return;
    }
  }

  private async recordSandboxRejection(
    trackedSession: AcpTrackedSession,
    params: Pick<AcpTerminalCreateParams, 'command' | 'args' | 'cwd'>,
    error: AcpJsonRpcError,
  ): Promise<void> {
    const reason = this.extractReason(error);

    await this.recordAudit(
      trackedSession,
      'acp.terminal.server_sandbox.rejected',
      {
        summary: 'Rejected ACP server_sandbox terminal request',
        metadata: {
          command: params.command,
          ...(typeof params.cwd === 'string' ? { cwd: params.cwd } : {}),
          ...(Array.isArray(params.args) ? { args: params.args } : {}),
          mode: 'server_sandbox',
          reason,
        },
      },
    );
  }

  private async recordTerminalKilledAudit(
    trackedSession: AcpTrackedSession,
    terminal: TerminalRecord,
    reason: 'manual_kill' | 'terminal_release' | 'session_cleanup',
  ): Promise<void> {
    await this.recordAudit(
      trackedSession,
      'acp.terminal.server_sandbox.killed',
      {
        summary: 'Killed ACP server_sandbox terminal',
        metadata: {
          terminalId: terminal.terminalId,
          execId: terminal.execId,
          signal: terminal.signal ?? DEFAULT_TERMINAL_KILL_SIGNAL,
          reason,
        },
      },
    );
  }

  private extractReason(error: AcpJsonRpcError): string {
    if (
      typeof error.data === 'object' &&
      error.data !== null &&
      'reason' in error.data &&
      typeof error.data.reason === 'string' &&
      error.data.reason.length > 0
    ) {
      return error.data.reason;
    }

    return 'terminal_request_failed';
  }

  private async recordAudit(
    trackedSession: AcpTrackedSession,
    eventType: string,
    payload: {
      summary: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.auditLogService) {
      return;
    }

    await this.auditLogService.record({
      tenantId: trackedSession.tenantId,
      actorId: null,
      actorType: 'service',
      eventType,
      resourceType: 'acp_session',
      resourceId: trackedSession.sessionId,
      summary: payload.summary,
      metadata: payload.metadata,
    });
  }
}
