import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';

import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import { SandboxService } from '../sandbox/sandbox.service';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  MAX_WORKSPACE_TEXT_PREVIEW_BYTES,
  type WorkspaceFileTreeNode,
} from '../workspace/workspace-preview.utils';
import type { AgentSession } from '../agent/types/agent-session.types';
import {
  readConversationAttachmentMetadata,
  type ConversationAttachmentMetadata,
} from '../agent-conversation/conversation-attachment';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';

const CONTAINER_WORKSPACE = '/workspace';
const FILE_WATCH_POLL_INTERVAL_MS = 3000;
const MARKER_FILE = '/tmp/.workspace_marker';
const CONVERSATION_WORKSPACE_TREE_SNAPSHOT_KEY = 'workspaceTreeSnapshot';
const CONVERSATION_WORKSPACE_TREE_ONLY_REASON =
  '此运行已结束，仅保留工作区目录结构，未保留文件内容预览';

export type FileTreeNode = WorkspaceFileTreeNode;

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

type ConversationWorkspaceTreeSnapshot = {
  nodes: FileTreeNode[];
  capturedAt: string;
  previewUnavailableReason: string;
};

type ResolvedConversationWorkspaceSource =
  | {
      kind: 'live';
      containerId: string;
    }
  | {
      kind: 'snapshot';
      snapshot: ConversationWorkspaceTreeSnapshot;
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
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async getFileTree(
    conversationId: string,
    tenantId: string,
  ): Promise<FileTreeNode[]> {
    try {
      const workspaceSource = await this.resolveConversationWorkspaceSource(
        conversationId,
        tenantId,
      );

      if (workspaceSource.kind === 'live') {
        return this.readFileTreeFromContainer(workspaceSource.containerId);
      }

      return workspaceSource.snapshot.nodes;
    } catch (error) {
      if (error instanceof NotFoundException) {
        await this.loadConversationRecord(conversationId, tenantId);
        return [];
      }

      throw error;
    }
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

    return this.workspaceService.getFileTree(
      tenantId,
      workspaceSource.workspaceSnapshotId,
    );
  }

  async getFileContent(
    conversationId: string,
    tenantId: string,
    filePath: string,
  ): Promise<FileContentResult> {
    this.normalizePath(filePath);
    const workspaceSource = await this.resolveConversationWorkspaceSource(
      conversationId,
      tenantId,
    );

    if (workspaceSource.kind === 'live') {
      return this.readFileContentFromContainer(
        workspaceSource.containerId,
        filePath,
      );
    }

    throw new ConflictException(
      workspaceSource.snapshot.previewUnavailableReason,
    );
  }

  async stageConversationAttachment(
    conversationId: string,
    tenantId: string,
    metadata: Record<string, unknown> | undefined,
  ): Promise<string | null> {
    const attachment = readConversationAttachmentMetadata(metadata);
    if (!attachment) {
      return null;
    }

    const session = await this.sandboxService.findByConversationId(
      conversationId,
      tenantId,
    );
    if (!session?.containerId) {
      return null;
    }

    const relativePath = await this.resolveAttachmentRelativePath(
      session.containerId,
      attachment.fileName,
    );
    const archive = await this.createConversationAttachmentArchive(
      attachment,
      relativePath,
    );

    try {
      await this.dockerService.putArchive(
        session.containerId,
        createReadStream(archive.archivePath),
        CONTAINER_WORKSPACE,
      );

      return `${CONTAINER_WORKSPACE}/${relativePath}`;
    } finally {
      await archive.cleanup();
    }
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

    const preview = await this.workspaceService.getFilePreview(
      tenantId,
      workspaceSource.workspaceSnapshotId,
      filePath,
    );

    if (preview.kind !== 'text') {
      throw new NotFoundException(
        `文件 ${filePath} 为二进制文件，不支持文本读取`,
      );
    }

    return {
      path: preview.path,
      content: preview.content,
      size: preview.size,
      encoding: preview.encoding,
    };
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
    let restoreWorkspaceId: string | undefined;

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
      restoreWorkspaceId = this.readWorkspaceRestoreId(sandboxSession?.config);

      if (!sandboxSession?.containerId) {
        return existingSnapshotId ?? restoreWorkspaceId ?? null;
      }

      if (restoreWorkspaceId) {
        await this.workspaceService.syncFromSandboxContainer(
          restoreWorkspaceId,
          sandboxSession.containerId,
          tenantId,
        );
        return restoreWorkspaceId;
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
      return existingSnapshotId ?? restoreWorkspaceId ?? null;
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
    _organizationId: string,
    _userId: string,
  ): Promise<void> {
    this.stopFileWatcher(conversationId);
    await this.captureConversationWorkspaceTreeSnapshot(
      conversationId,
      tenantId,
    );
  }

  async captureConversationWorkspaceTreeSnapshot(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    const session = await this.sandboxService.findByConversationId(
      conversationId,
      tenantId,
    );

    if (!session?.containerId) {
      this.logger.debug(
        `对话 ${conversationId} 没有关联的运行中沙箱容器，跳过目录树快照保存`,
      );
      return;
    }

    try {
      const tree = await this.readFileTreeFromContainer(session.containerId);
      await this.persistConversationWorkspaceTreeSnapshot(
        conversationId,
        tenantId,
        tree,
      );

      this.logger.log(
        `对话 ${conversationId} 工作区目录树快照已保存: sandbox=${session.id}, nodes=${tree.length}`,
      );
    } catch (error) {
      this.logger.error(
        `对话 ${conversationId} 工作区目录树快照保存失败`,
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
    try {
      await this.onConversationEnd(
        payload.conversationId,
        payload.tenantId,
        payload.organizationId,
        payload.userId,
      );
    } finally {
      try {
        await this.sandboxService.endConversationSandbox(
          payload.conversationId,
          payload.tenantId,
        );
      } catch (error) {
        this.logger.error(
          `对话 ${payload.conversationId} 结束后释放沙箱失败`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
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

  private async resolveConversationWorkspaceSource(
    conversationId: string,
    tenantId: string,
  ): Promise<ResolvedConversationWorkspaceSource> {
    try {
      const containerId = await this.resolveConversationContainerId(
        conversationId,
        tenantId,
      );

      return {
        kind: 'live',
        containerId,
      };
    } catch (error) {
      const snapshot = await this.loadConversationWorkspaceTreeSnapshot(
        conversationId,
        tenantId,
      );

      if (snapshot) {
        return {
          kind: 'snapshot',
          snapshot,
        };
      }

      throw error;
    }
  }

  private async loadConversationWorkspaceTreeSnapshot(
    conversationId: string,
    tenantId: string,
  ): Promise<ConversationWorkspaceTreeSnapshot | null> {
    const conversation = await this.loadConversationRecord(
      conversationId,
      tenantId,
    );

    return this.readConversationWorkspaceTreeSnapshot(conversation.metadata);
  }

  private async loadConversationRecord(
    conversationId: string,
    tenantId: string,
  ): Promise<Pick<schema.AgentConversation, 'id' | 'metadata'>> {
    const [conversation] = await this.tenantDb
      .select({
        id: schema.agentConversations.id,
        metadata: schema.agentConversations.metadata,
      })
      .from(schema.agentConversations)
      .where(
        and(
          eq(schema.agentConversations.id, conversationId),
          eq(schema.agentConversations.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!conversation) {
      throw new NotFoundException(`对话 ${conversationId} 不存在`);
    }

    return conversation;
  }

  private readConversationWorkspaceTreeSnapshot(
    metadata: unknown,
  ): ConversationWorkspaceTreeSnapshot | null {
    const metadataRecord = this.isRecord(metadata) ? metadata : null;
    const snapshotRecord =
      metadataRecord &&
      this.isRecord(metadataRecord[CONVERSATION_WORKSPACE_TREE_SNAPSHOT_KEY])
        ? metadataRecord[CONVERSATION_WORKSPACE_TREE_SNAPSHOT_KEY]
        : null;

    if (!snapshotRecord) {
      return null;
    }

    return {
      nodes: this.normalizeStoredFileTreeNodes(snapshotRecord.nodes),
      capturedAt:
        this.readString(snapshotRecord.capturedAt) ?? new Date(0).toISOString(),
      previewUnavailableReason:
        this.readString(snapshotRecord.previewUnavailableReason) ??
        CONVERSATION_WORKSPACE_TREE_ONLY_REASON,
    };
  }

  private normalizeStoredFileTreeNodes(value: unknown): FileTreeNode[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      if (!this.isRecord(entry)) {
        return [];
      }

      const name = this.readString(entry.name);
      const path = this.readString(entry.path);
      const type =
        entry.type === 'directory'
          ? 'directory'
          : entry.type === 'file'
            ? 'file'
            : null;

      if (!name || !path || !type) {
        return [];
      }

      const size =
        typeof entry.size === 'number' && Number.isFinite(entry.size)
          ? entry.size
          : undefined;

      return [
        {
          name,
          path,
          type,
          ...(size !== undefined ? { size } : {}),
          ...(type === 'directory'
            ? { children: this.normalizeStoredFileTreeNodes(entry.children) }
            : {}),
        } satisfies FileTreeNode,
      ];
    });
  }

  private async persistConversationWorkspaceTreeSnapshot(
    conversationId: string,
    tenantId: string,
    nodes: FileTreeNode[],
  ): Promise<void> {
    const conversation = await this.loadConversationRecord(
      conversationId,
      tenantId,
    );
    const metadata = this.isRecord(conversation.metadata)
      ? conversation.metadata
      : {};

    await this.tenantDb
      .update(schema.agentConversations)
      .set({
        metadata: {
          ...metadata,
          [CONVERSATION_WORKSPACE_TREE_SNAPSHOT_KEY]: {
            nodes,
            capturedAt: new Date().toISOString(),
            previewUnavailableReason: CONVERSATION_WORKSPACE_TREE_ONLY_REASON,
          } satisfies ConversationWorkspaceTreeSnapshot,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.agentConversations.id, conversationId),
          eq(schema.agentConversations.tenantId, tenantId),
        ),
      );
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

  private readWorkspaceRestoreId(config: unknown): string | undefined {
    if (!this.isRecord(config)) {
      return undefined;
    }

    return this.readString(config.restoreWorkspaceId);
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

    if (size > MAX_WORKSPACE_TEXT_PREVIEW_BYTES) {
      throw new NotFoundException(
        `文件 ${filePath} 超过最大读取限制 (${MAX_WORKSPACE_TEXT_PREVIEW_BYTES} 字节)`,
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

  private async resolveAttachmentRelativePath(
    containerId: string,
    fileName: string,
  ): Promise<string> {
    const sanitized = this.sanitizeAttachmentFileName(fileName);
    const candidate = `uploads/${sanitized}`;

    if (
      !(await this.containerPathExists(
        containerId,
        `${CONTAINER_WORKSPACE}/${candidate}`,
      ))
    ) {
      return candidate;
    }

    const extension = extname(sanitized);
    const stem = extension ? sanitized.slice(0, -extension.length) : sanitized;
    return `uploads/${stem}-${randomUUID().slice(0, 8)}${extension}`;
  }

  private async containerPathExists(
    containerId: string,
    fullPath: string,
  ): Promise<boolean> {
    try {
      const output = await this.execInContainer(containerId, 'sh', [
        '-lc',
        `[ -e ${this.quoteShellPath(fullPath)} ] && printf exists || printf missing`,
      ]);
      return output.includes('exists');
    } catch {
      return false;
    }
  }

  private sanitizeAttachmentFileName(fileName: string): string {
    const normalized = basename(fileName)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/]/g, '_')
      .trim();

    return normalized.length > 0 ? normalized : 'attachment.bin';
  }

  private async createConversationAttachmentArchive(
    attachment: ConversationAttachmentMetadata,
    relativePath: string,
  ): Promise<{ archivePath: string; cleanup: () => Promise<void> }> {
    const tempDir = await mkdtemp(
      join(tmpdir(), 'agentloom-conversation-attachment-'),
    );
    const archivePath = join(tempDir, 'attachment.tar');

    try {
      await mkdir(join(tempDir, 'uploads'), { recursive: true });

      const payload =
        attachment.textContent !== undefined
          ? Buffer.from(attachment.textContent, 'utf8')
          : Buffer.from(attachment.dataBase64 ?? '', 'base64');

      await writeFile(join(tempDir, relativePath), payload);
      await this.createTarArchive(tempDir, 'uploads', archivePath);

      return {
        archivePath,
        cleanup: async () => {
          await rm(tempDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  private async createTarArchive(
    sourceDir: string,
    rootEntry: string,
    archivePath: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', ['-cf', archivePath, '-C', sourceDir, rootEntry], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';
      tar.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      tar.on('error', reject);
      tar.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `Failed to create attachment archive${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
          ),
        );
      });
    });
  }

  private quoteShellPath(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
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
