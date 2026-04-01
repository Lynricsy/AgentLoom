import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';

import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import { SandboxService } from '../sandbox/sandbox.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type { SandboxConfig } from '../../database/schema';
import type { AgentSession } from '../agent/types/agent-session.types';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';

const CONTAINER_WORKSPACE = '/workspace';
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_WORKSPACE_ARCHIVE_BYTES = 50 * 1024 * 1024;
const FILE_WATCH_POLL_INTERVAL_MS = 3000;
const MARKER_FILE = '/tmp/.workspace_marker';

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileTreeNode[];
}

export interface FileContentResult {
  path: string;
  content: string;
  size: number;
  encoding: 'utf-8';
}

export interface FileChangeEvent {
  tenantId: string;
  changedFiles: string[];
  timestamp: string;
  conversationId?: string;
  executionId?: string;
  stepId?: string;
  sandboxNodeId?: string;
}

type ConversationWatchTarget = {
  kind: 'conversation';
  conversationId: string;
};

type ExecutionStepWatchTarget = {
  kind: 'execution-step';
  executionId: string;
  stepId: string;
  sandboxNodeId?: string;
};

type WatchTarget = ConversationWatchTarget | ExecutionStepWatchTarget;

type ResolvedExecutionStepContainer = {
  containerId: string;
  sandboxNodeId?: string;
};

type ResolvedExecutionStepWorkspaceSource =
  | {
      kind: 'live';
      containerId: string;
      sandboxNodeId?: string;
    }
  | {
      kind: 'snapshot';
      workspaceSnapshotId: string;
    };

type ArchiveEntry = {
  path: string;
  type: 'file' | 'directory';
  size: number;
  content: Buffer;
};

@Injectable()
export class WorkspaceIntegrationService {
  private readonly logger = new Logger(WorkspaceIntegrationService.name);

  private readonly activeWatchers = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDB,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly dockerService: SandboxRuntimeDriver,
    private readonly sandboxService: SandboxService,
    private readonly workspaceService: WorkspaceService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sessionPersistence: SessionPersistenceService,
    private readonly storageService: StorageService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async getFileTree(
    conversationId: string,
    tenantId: string,
  ): Promise<FileTreeNode[]> {
    const containerId = await this.resolveConversationContainerId(
      conversationId,
      tenantId,
    );

    return this.readFileTreeFromContainer(containerId);
  }

  async getExecutionStepFileTree(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<FileTreeNode[]> {
    const workspaceSource = await this.resolveExecutionStepWorkspaceSource(
      executionId,
      stepId,
      tenantId,
    );

    if (workspaceSource.kind === 'live') {
      return this.readFileTreeFromContainer(workspaceSource.containerId);
    }

    return this.readFileTreeFromSnapshot(
      workspaceSource.workspaceSnapshotId,
      tenantId,
    );
  }

  async getFileContent(
    conversationId: string,
    tenantId: string,
    filePath: string,
  ): Promise<FileContentResult> {
    const containerId = await this.resolveConversationContainerId(
      conversationId,
      tenantId,
    );

    return this.readFileContentFromContainer(containerId, filePath);
  }

  async getExecutionStepFileContent(
    executionId: string,
    stepId: string,
    tenantId: string,
    filePath: string,
  ): Promise<FileContentResult> {
    const workspaceSource = await this.resolveExecutionStepWorkspaceSource(
      executionId,
      stepId,
      tenantId,
    );

    if (workspaceSource.kind === 'live') {
      return this.readFileContentFromContainer(
        workspaceSource.containerId,
        filePath,
      );
    }

    return this.readFileContentFromSnapshot(
      workspaceSource.workspaceSnapshotId,
      tenantId,
      filePath,
    );
  }

  async archiveExecutionStepWorkspace(
    executionId: string,
    stepId: string,
    tenantId: string,
    sandboxNodeId?: string,
  ): Promise<string | null> {
    const stepRecord = await this.loadExecutionStepRecord(
      executionId,
      stepId,
      tenantId,
    );
    const existingSnapshotId = this.readWorkspaceSnapshotId(
      stepRecord.checkpointData,
    );

    try {
      const session = await this.sessionPersistence.loadFromCheckpoint(
        tenantId,
        stepId,
      );
      const sandboxBinding = this.readExecutionStepSandboxBinding(
        session,
        stepRecord.checkpointData,
        {
          executionId,
          ...(sandboxNodeId ? { sandboxNodeId } : {}),
        },
      );
      const sandboxSession = await this.sandboxService.findByExecutionId(
        executionId,
        tenantId,
        sandboxBinding.sandboxNodeId,
      );

      if (!sandboxSession?.containerId) {
        return existingSnapshotId ?? null;
      }

      const [execution] = await this.tenantDb
        .select({
          createdBy: schema.workflowExecutions.createdBy,
        })
        .from(schema.workflowExecutions)
        .where(eq(schema.workflowExecutions.id, executionId))
        .limit(1);

      if (!execution?.createdBy) {
        this.logger.warn(
          `归档步骤工作区失败：执行 ${executionId} 缺少 createdBy，step=${stepId}`,
        );
        return existingSnapshotId ?? null;
      }

      const organizationId =
        await this.workspaceService.resolveOrganizationId(tenantId);
      const snapshot = await this.workspaceService.createFromSandbox(
        tenantId,
        organizationId,
        execution.createdBy,
        sandboxSession.id,
        `execution-${executionId}-step-${stepId}-workspace`,
        `执行 ${executionId} 的步骤 ${stepId} 结束时自动归档的工作区快照`,
      );

      return snapshot.id;
    } catch (error) {
      this.logger.error(
        `归档 workflow step 工作区失败: execution=${executionId}, step=${stepId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return existingSnapshotId ?? null;
    }
  }

  startFileWatcher(
    conversationId: string,
    tenantId: string,
    containerId: string,
  ): void {
    this.startWatcher(
      {
        kind: 'conversation',
        conversationId,
      },
      tenantId,
      containerId,
    );
  }

  async startExecutionStepFileWatcher(params: {
    executionId: string;
    stepId: string;
    tenantId: string;
    sandboxNodeId?: string;
  }): Promise<void> {
    const { executionId, stepId, tenantId, sandboxNodeId } = params;
    try {
      const session = await this.sandboxService.findByExecutionId(
        executionId,
        tenantId,
        sandboxNodeId,
      );
      if (!session?.containerId) {
        return;
      }

      this.startWatcher(
        {
          kind: 'execution-step',
          executionId,
          stepId,
          ...(sandboxNodeId ? { sandboxNodeId } : {}),
        },
        tenantId,
        session.containerId,
      );
    } catch (error) {
      this.logger.warn(
        `启动 workflow step 文件监听失败: execution=${executionId}, step=${stepId}, error=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  stopFileWatcher(conversationId: string): void {
    this.stopWatcher({
      kind: 'conversation',
      conversationId,
    });
  }

  stopExecutionStepFileWatcher(executionId: string, stepId: string): void {
    this.stopWatcher({
      kind: 'execution-step',
      executionId,
      stepId,
    });
  }

  async onConversationEnd(
    conversationId: string,
    tenantId: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    this.stopFileWatcher(conversationId);

    const session = await this.sandboxService.findByConversationId(
      conversationId,
      tenantId,
    );

    if (!session) {
      this.logger.debug(`对话 ${conversationId} 没有关联的沙箱会话，跳过归档`);
      return;
    }

    const sandboxConfig = session.config as SandboxConfig | null;
    const persistencePath = sandboxConfig?.persistencePath;

    if (!persistencePath) {
      this.logger.debug(
        `对话 ${conversationId} 的沙箱没有 persistencePath 配置，跳过归档`,
      );
      return;
    }

    try {
      await this.workspaceService.createFromSandbox(
        tenantId,
        organizationId,
        userId,
        session.id,
        `conversation-${conversationId}-workspace`,
        `对话 ${conversationId} 结束时自动归档的工作区快照`,
      );

      this.logger.log(
        `对话 ${conversationId} 工作区已归档: sandbox=${session.id}`,
      );
    } catch (error) {
      this.logger.error(
        `对话 ${conversationId} 工作区归档失败`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  @OnEvent('agent-conversation.ended')
  async handleConversationEnded(payload: {
    conversationId: string;
    tenantId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    await this.onConversationEnd(
      payload.conversationId,
      payload.tenantId,
      payload.organizationId,
      payload.userId,
    );
  }

  stopAllWatchers(): void {
    for (const [watchKey, timer] of this.activeWatchers) {
      clearInterval(timer);
      this.logger.debug(`文件监听器已清理: key=${watchKey}`);
    }
    this.activeWatchers.clear();
  }

  private async resolveConversationContainerId(
    conversationId: string,
    tenantId: string,
  ): Promise<string> {
    const session = await this.sandboxService.findByConversationId(
      conversationId,
      tenantId,
    );

    if (!session || !session.containerId) {
      throw new NotFoundException(
        `对话 ${conversationId} 没有运行中的沙箱容器`,
      );
    }

    return session.containerId;
  }

  private async resolveExecutionStepContainer(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<ResolvedExecutionStepContainer> {
    const stepRecord = await this.loadExecutionStepRecord(
      executionId,
      stepId,
      tenantId,
    );
    const session = await this.sessionPersistence.loadFromCheckpoint(
      tenantId,
      stepId,
    );
    const sandboxBinding = this.readExecutionStepSandboxBinding(
      session,
      stepRecord.checkpointData,
    );

    if (
      sandboxBinding.executionId &&
      sandboxBinding.executionId !== executionId
    ) {
      throw new NotFoundException(
        `步骤 ${stepId} 不属于执行 ${executionId} 的运行时沙箱`,
      );
    }

    const sandboxSession = await this.sandboxService.findByExecutionId(
      executionId,
      tenantId,
      sandboxBinding.sandboxNodeId,
    );

    if (!sandboxSession?.containerId) {
      throw new NotFoundException(
        `执行 ${executionId} 的步骤 ${stepId} 没有关联的运行中沙箱容器`,
      );
    }

    return {
      containerId: sandboxSession.containerId,
      ...(sandboxBinding.sandboxNodeId
        ? { sandboxNodeId: sandboxBinding.sandboxNodeId }
        : {}),
    };
  }

  private async resolveExecutionStepWorkspaceSource(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<ResolvedExecutionStepWorkspaceSource> {
    const stepRecord = await this.loadExecutionStepRecord(
      executionId,
      stepId,
      tenantId,
    );

    try {
      const liveContainer = await this.resolveExecutionStepContainer(
        executionId,
        stepId,
        tenantId,
      );

      return {
        kind: 'live',
        containerId: liveContainer.containerId,
        ...(liveContainer.sandboxNodeId
          ? { sandboxNodeId: liveContainer.sandboxNodeId }
          : {}),
      };
    } catch (error) {
      const snapshotId = this.readWorkspaceSnapshotId(
        stepRecord.checkpointData,
      );
      if (snapshotId) {
        return {
          kind: 'snapshot',
          workspaceSnapshotId: snapshotId,
        };
      }

      throw error;
    }
  }

  private async loadExecutionStepRecord(
    executionId: string,
    stepId: string,
    _tenantId: string,
  ): Promise<schema.ExecutionStep> {
    const [stepRecord] = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId))
      .limit(1);

    if (!stepRecord || stepRecord.executionId !== executionId) {
      throw new NotFoundException(`步骤 ${stepId} 不属于执行 ${executionId}`);
    }

    return stepRecord;
  }

  private readWorkspaceSnapshotId(checkpointData: unknown): string | undefined {
    if (!this.isRecord(checkpointData)) {
      return undefined;
    }

    const snapshotId = checkpointData.workspaceSnapshotId;
    return typeof snapshotId === 'string' && snapshotId.trim().length > 0
      ? snapshotId.trim()
      : undefined;
  }

  private readExecutionStepSandboxBinding(
    session: AgentSession | null,
    checkpointData?: unknown,
    fallback?: {
      executionId?: string;
      sandboxNodeId?: string;
    },
  ): {
    executionId?: string;
    sandboxNodeId?: string;
  } {
    const workflowState =
      session?.context?.workflowState &&
      this.isRecord(session.context.workflowState)
        ? session.context.workflowState
        : null;
    const nestedServerSandbox =
      workflowState && this.isRecord(workflowState.serverSandbox)
        ? workflowState.serverSandbox
        : null;
    const checkpointRecord = this.isRecord(checkpointData)
      ? checkpointData
      : null;
    const checkpointServerSandbox =
      checkpointRecord && this.isRecord(checkpointRecord.serverSandbox)
        ? checkpointRecord.serverSandbox
        : null;
    const executionId = this.readString(
      fallback?.executionId,
      workflowState?.executionId,
      nestedServerSandbox?.executionId,
      checkpointRecord?.executionId,
      checkpointServerSandbox?.executionId,
    );
    const sandboxNodeId = this.readString(
      fallback?.sandboxNodeId,
      workflowState?.sandboxNodeId,
      nestedServerSandbox?.sandboxNodeId,
      checkpointRecord?.sandboxNodeId,
      checkpointServerSandbox?.sandboxNodeId,
    );

    return {
      ...(executionId ? { executionId } : {}),
      ...(sandboxNodeId ? { sandboxNodeId } : {}),
    };
  }

  private readString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private async readFileTreeFromContainer(
    containerId: string,
  ): Promise<FileTreeNode[]> {
    const output = await this.execInContainer(containerId, 'find', [
      CONTAINER_WORKSPACE,
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      '*/.git/*',
      '-not',
      '-name',
      '.*',
      '-printf',
      '%y|%s|%P\\n',
    ]);

    return this.parseFileTree(output);
  }

  private async readFileTreeFromSnapshot(
    workspaceSnapshotId: string,
    tenantId: string,
  ): Promise<FileTreeNode[]> {
    const entries = await this.readWorkspaceSnapshotEntries(
      workspaceSnapshotId,
      tenantId,
    );

    return this.buildFileTreeFromEntries(entries);
  }

  private async readFileContentFromContainer(
    containerId: string,
    filePath: string,
  ): Promise<FileContentResult> {
    const normalizedPath = this.normalizePath(filePath);
    const fullPath = `${CONTAINER_WORKSPACE}/${normalizedPath}`;

    const statOutput = await this.execInContainer(containerId, 'stat', [
      '-c',
      '%s|%F',
      fullPath,
    ]);

    const [sizeStr, fileType] = statOutput.trim().split('|');
    const size = parseInt(sizeStr, 10);

    if (fileType !== 'regular file') {
      throw new NotFoundException(`路径 ${filePath} 不是普通文件`);
    }

    if (size > MAX_TEXT_FILE_BYTES) {
      throw new NotFoundException(
        `文件 ${filePath} 超过最大读取限制 (${MAX_TEXT_FILE_BYTES} 字节)`,
      );
    }

    const headOutput = await this.execInContainerRaw(containerId, 'head', [
      '-c',
      '8192',
      fullPath,
    ]);

    if (this.isBinaryBuffer(headOutput)) {
      throw new NotFoundException(
        `文件 ${filePath} 为二进制文件，不支持文本读取`,
      );
    }

    const content = await this.execInContainer(containerId, 'cat', [fullPath]);

    return {
      path: normalizedPath,
      content,
      size,
      encoding: 'utf-8',
    };
  }

  private async readFileContentFromSnapshot(
    workspaceSnapshotId: string,
    tenantId: string,
    filePath: string,
  ): Promise<FileContentResult> {
    const normalizedPath = this.normalizePath(filePath);
    const entries = await this.readWorkspaceSnapshotEntries(
      workspaceSnapshotId,
      tenantId,
    );
    const fileEntry = entries.find(
      (entry) => entry.type === 'file' && entry.path === normalizedPath,
    );

    if (!fileEntry) {
      throw new NotFoundException(`路径 ${filePath} 不是普通文件`);
    }

    if (fileEntry.size > MAX_TEXT_FILE_BYTES) {
      throw new NotFoundException(
        `文件 ${filePath} 超过最大读取限制 (${MAX_TEXT_FILE_BYTES} 字节)`,
      );
    }

    if (this.isBinaryBuffer(fileEntry.content.subarray(0, 8192))) {
      throw new NotFoundException(
        `文件 ${filePath} 为二进制文件，不支持文本读取`,
      );
    }

    return {
      path: normalizedPath,
      content: fileEntry.content.toString('utf-8'),
      size: fileEntry.size,
      encoding: 'utf-8',
    };
  }

  private async readWorkspaceSnapshotEntries(
    workspaceSnapshotId: string,
    tenantId: string,
  ): Promise<ArchiveEntry[]> {
    const snapshot = await this.workspaceService.findOne(
      tenantId,
      workspaceSnapshotId,
    );

    if (snapshot.status !== 'ready') {
      throw new NotFoundException(`工作区快照 ${workspaceSnapshotId} 尚未就绪`);
    }

    const archiveStream = await this.storageService.download(
      snapshot.storageKey,
    );
    const archiveBuffer = await this.readStreamToBuffer(archiveStream);

    if (archiveBuffer.length === 0) {
      return [];
    }

    return this.parseArchiveEntries(archiveBuffer);
  }

  private async readStreamToBuffer(
    stream: AsyncIterable<unknown>,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : chunk instanceof Uint8Array
          ? Buffer.from(chunk)
          : Buffer.from(String(chunk));
      totalBytes += buffer.length;

      if (totalBytes > MAX_WORKSPACE_ARCHIVE_BYTES) {
        throw new NotFoundException(
          `工作区快照超过在线预览限制 (${MAX_WORKSPACE_ARCHIVE_BYTES} 字节)`,
        );
      }

      chunks.push(buffer);
    }

    return Buffer.concat(chunks);
  }

  private parseArchiveEntries(archiveBuffer: Buffer): ArchiveEntry[] {
    const rawEntries: ArchiveEntry[] = [];
    let offset = 0;

    while (offset + 512 <= archiveBuffer.length) {
      const header = archiveBuffer.subarray(offset, offset + 512);
      if (header.every((value) => value === 0)) {
        break;
      }

      const name = this.readTarString(header.subarray(0, 100));
      const prefix = this.readTarString(header.subarray(345, 500));
      const fullPath = [prefix, name].filter(Boolean).join('/');
      const size = this.readTarOctal(header.subarray(124, 136));
      const typeFlagByte = header[156] ?? 0;
      const typeFlag =
        typeFlagByte === 0 ? '0' : String.fromCharCode(typeFlagByte);
      const dataStart = offset + 512;
      const dataEnd = dataStart + size;

      if (dataEnd > archiveBuffer.length) {
        throw new NotFoundException('工作区快照已损坏，无法解析');
      }

      const normalizedPath = this.normalizeArchivePath(fullPath);
      if (normalizedPath) {
        if (typeFlag === '5') {
          rawEntries.push({
            path: normalizedPath,
            type: 'directory',
            size: 0,
            content: Buffer.alloc(0),
          });
        } else if (typeFlag === '0') {
          rawEntries.push({
            path: normalizedPath,
            type: 'file',
            size,
            content: Buffer.from(archiveBuffer.subarray(dataStart, dataEnd)),
          });
        }
      }

      offset = dataStart + Math.ceil(size / 512) * 512;
    }

    return this.stripWorkspaceRootIfNeeded(rawEntries);
  }

  private stripWorkspaceRootIfNeeded(entries: ArchiveEntry[]): ArchiveEntry[] {
    if (
      entries.length === 0 ||
      !entries.every(
        (entry) =>
          entry.path === 'workspace' || entry.path.startsWith('workspace/'),
      )
    ) {
      return entries;
    }

    return entries
      .map((entry) => {
        if (entry.path === 'workspace') {
          return null;
        }

        return {
          ...entry,
          path: entry.path.slice('workspace/'.length),
        };
      })
      .filter((entry): entry is ArchiveEntry => entry !== null);
  }

  private normalizeArchivePath(rawPath: string): string | null {
    let normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    while (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }
    normalized = normalized.replace(/\/+/g, '/').replace(/\/+$/, '');

    if (!normalized || normalized === '.') {
      return null;
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
      return null;
    }

    if (
      segments.some(
        (segment) =>
          segment === 'node_modules' ||
          segment === '.git' ||
          segment.startsWith('.'),
      )
    ) {
      return null;
    }

    return segments.join('/');
  }

  private readTarString(buffer: Buffer): string {
    return buffer.toString('utf-8').replace(/\0.*$/, '');
  }

  private readTarOctal(buffer: Buffer): number {
    const raw = buffer.toString('utf-8').replace(/\0.*$/, '').trim();
    if (!raw) {
      return 0;
    }

    return Number.parseInt(raw, 8);
  }

  private buildFileTreeFromEntries(entries: ArchiveEntry[]): FileTreeNode[] {
    const root: FileTreeNode[] = [];
    const directoryMap = new Map<string, FileTreeNode>();
    const fileSet = new Set<string>();

    const ensureDirectory = (dirPath: string): FileTreeNode => {
      const existing = directoryMap.get(dirPath);
      if (existing) {
        return existing;
      }

      const segments = dirPath.split('/');
      const name = segments[segments.length - 1] ?? dirPath;
      const parentPath = segments.slice(0, -1).join('/');
      const node: FileTreeNode = {
        name,
        type: 'directory',
        path: dirPath,
        children: [],
      };
      directoryMap.set(dirPath, node);

      if (parentPath) {
        ensureDirectory(parentPath).children!.push(node);
      } else {
        root.push(node);
      }

      return node;
    };

    for (const entry of entries) {
      const segments = entry.path.split('/');
      const parentPath = segments.slice(0, -1).join('/');
      if (parentPath) {
        ensureDirectory(parentPath);
      }

      if (entry.type === 'directory') {
        ensureDirectory(entry.path);
        continue;
      }

      if (fileSet.has(entry.path)) {
        continue;
      }

      const node: FileTreeNode = {
        name: segments[segments.length - 1] ?? entry.path,
        type: 'file',
        path: entry.path,
        size: entry.size,
      };
      fileSet.add(entry.path);

      if (parentPath) {
        ensureDirectory(parentPath).children!.push(node);
      } else {
        root.push(node);
      }
    }

    return root;
  }

  private async execInContainer(
    containerId: string,
    command: string,
    args: string[],
  ): Promise<string> {
    const handle = await this.dockerService.createExec(containerId, {
      command,
      args,
      cwd: CONTAINER_WORKSPACE,
    });

    const chunks: string[] = [];

    await this.dockerService.attachExecOutput(
      handle.execId,
      (level, message) => {
        if (level === 'stdout') {
          chunks.push(message);
        }
      },
    );

    const exitInfo = await this.dockerService.waitForExecExit(handle.execId);

    if (exitInfo.exitCode !== 0) {
      const errorOutput = chunks.join('');
      throw new NotFoundException(
        `命令执行失败 (exit=${exitInfo.exitCode}): ${errorOutput.slice(0, 200)}`,
      );
    }

    return chunks.join('');
  }

  private async execInContainerRaw(
    containerId: string,
    command: string,
    args: string[],
  ): Promise<Buffer> {
    const handle = await this.dockerService.createExec(containerId, {
      command,
      args,
      cwd: CONTAINER_WORKSPACE,
    });

    const chunks: Buffer[] = [];

    await this.dockerService.attachExecOutput(
      handle.execId,
      (_level, message) => {
        chunks.push(Buffer.from(message));
      },
    );

    await this.dockerService.waitForExecExit(handle.execId);

    return Buffer.concat(chunks);
  }

  // Security: prevents path traversal outside /workspace boundary
  private normalizePath(filePath: string): string {
    let normalized = filePath.replace(/^\/+/, '');

    const segments = normalized.split('/').filter(Boolean);
    const resolved: string[] = [];

    for (const seg of segments) {
      if (seg === '..') {
        if (resolved.length === 0) {
          throw new NotFoundException(
            '路径穿越被拒绝：不允许访问工作区外的文件',
          );
        }
        resolved.pop();
      } else if (seg !== '.') {
        resolved.push(seg);
      }
    }

    normalized = resolved.join('/');

    if (!normalized) {
      throw new NotFoundException('文件路径不能为空');
    }

    return normalized;
  }

  private isBinaryBuffer(buffer: Buffer): boolean {
    return buffer.includes(0);
  }

  private parseFileTree(findOutput: string): FileTreeNode[] {
    const lines = findOutput.trim().split('\n').filter(Boolean);
    const root: FileTreeNode[] = [];
    const dirMap = new Map<string, FileTreeNode>();

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 3) continue;

      const [type, sizeStr, relativePath] = parts;

      if (!relativePath) continue;

      const isDir = type === 'd';
      const pathSegments = relativePath.split('/');
      const name = pathSegments[pathSegments.length - 1];
      const parentPath = pathSegments.slice(0, -1).join('/');

      const node: FileTreeNode = {
        name,
        type: isDir ? 'directory' : 'file',
        path: relativePath,
        ...(isDir ? { children: [] } : { size: parseInt(sizeStr, 10) }),
      };

      if (isDir) {
        dirMap.set(relativePath, node);
      }

      if (!parentPath) {
        root.push(node);
      } else {
        const parent = dirMap.get(parentPath);
        if (parent?.children) {
          parent.children.push(node);
        } else {
          root.push(node);
        }
      }
    }

    return root;
  }

  private async initMarkerFile(containerId: string): Promise<void> {
    await this.execInContainer(containerId, 'touch', [MARKER_FILE]);
  }

  private startWatcher(
    target: WatchTarget,
    tenantId: string,
    containerId: string,
  ): void {
    const watchKey = this.buildWatchKey(target);

    if (this.activeWatchers.has(watchKey)) {
      this.logger.debug(`文件监听器已存在: key=${watchKey}`);
      return;
    }

    this.initMarkerFile(containerId).catch((err) =>
      this.logger.warn(
        `创建标记文件失败: key=${watchKey}, error=${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    const timer = setInterval(async () => {
      try {
        await this.pollFileChanges(target, tenantId, containerId);
      } catch (error) {
        this.logger.warn(
          `文件变更轮询失败: key=${watchKey}, error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, FILE_WATCH_POLL_INTERVAL_MS);

    this.activeWatchers.set(watchKey, timer);
    this.logger.log(`文件监听器已启动: key=${watchKey}`);
  }

  private stopWatcher(target: WatchTarget): void {
    const watchKey = this.buildWatchKey(target);
    const timer = this.activeWatchers.get(watchKey);
    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.activeWatchers.delete(watchKey);
    this.logger.log(`文件监听器已停止: key=${watchKey}`);
  }

  private buildWatchKey(target: WatchTarget): string {
    if (target.kind === 'conversation') {
      return `conversation:${target.conversationId}`;
    }

    return `execution-step:${target.executionId}:${target.stepId}`;
  }

  private async pollFileChanges(
    target: WatchTarget,
    tenantId: string,
    containerId: string,
  ): Promise<void> {
    const output = await this.execInContainer(containerId, 'find', [
      CONTAINER_WORKSPACE,
      '-newer',
      MARKER_FILE,
      '-type',
      'f',
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      '*/.git/*',
      '-printf',
      '%P\\n',
    ]);

    const changedFiles = output.trim().split('\n').filter(Boolean);

    if (changedFiles.length > 0) {
      await this.execInContainer(containerId, 'touch', [MARKER_FILE]);

      const event: FileChangeEvent = {
        tenantId,
        changedFiles,
        timestamp: new Date().toISOString(),
        ...(target.kind === 'conversation'
          ? { conversationId: target.conversationId }
          : {
              executionId: target.executionId,
              stepId: target.stepId,
              ...(target.sandboxNodeId
                ? { sandboxNodeId: target.sandboxNodeId }
                : {}),
            }),
      };

      this.eventEmitter.emit('workspace.file_change', event);

      this.logger.debug(
        `文件变更检测到: key=${this.buildWatchKey(target)}, files=${changedFiles.length}`,
      );
    }
  }
}
