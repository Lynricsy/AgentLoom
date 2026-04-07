import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, desc, ne, count, sql } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  readFile,
  rm,
  mkdtemp,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import {
  buildWorkspaceStorageKey,
  isLegacyEmptyWorkspaceStorageKey,
  WORKSPACE_SNAPSHOT_FILENAME,
} from './workspace.constants';
import {
  enrichWorkspaceSnapshot,
  type WorkspaceListItem,
} from './workspace-source.utils';
import {
  buildWorkspaceFilePreview,
  buildWorkspaceFileTree,
  detectWorkspaceMimeType,
  parseWorkspaceArchiveEntries,
  findWorkspaceArchiveFileEntryFromStream,
  normalizeWorkspacePreviewPath,
  parseWorkspaceArchiveEntriesFromStream,
  type WorkspaceArchiveEntry,
  type WorkspaceFileAsset,
  type WorkspaceFilePreview,
  type WorkspaceFileTreeNode,
} from './workspace-preview.utils';

const CONTAINER_WORKSPACE = '/workspace/';
const CONTAINER_TEMP_ROOT = '/tmp';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly dockerService: SandboxRuntimeDriver,
  ) {}

  async resolveOrganizationId(tenantId: string): Promise<string> {
    const tenantDb = getTenantDb(this.db);
    const [organization] = await tenantDb
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.tenantId, tenantId))
      .limit(1);

    if (!organization) {
      throw new NotFoundException(
        `Organization for tenant ${tenantId} not found`,
      );
    }

    return organization.id;
  }

  async createFromSandbox(
    tenantId: string,
    organizationId: string,
    userId: string,
    sandboxSessionId: string,
    name: string,
    description?: string,
  ): Promise<schema.WorkspaceSnapshot> {
    const tenantDb = getTenantDb(this.db);
    const [session] = await tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(eq(schema.sandboxSessions.id, sandboxSessionId))
      .limit(1);

    if (!session || !session.containerId) {
      throw new NotFoundException(
        `Sandbox session ${sandboxSessionId} not found or container not ready`,
      );
    }

    const [snapshot] = await tenantDb
      .insert(schema.workspaceSnapshots)
      .values({
        organizationId,
        tenantId,
        name,
        description: description ?? null,
        storageKey: 'pending',
        status: 'creating',
        createdById: userId,
        config: { sourceSandboxSessionId: sandboxSessionId },
      })
      .returning();

    const storageKey = buildWorkspaceStorageKey(tenantId, snapshot.id);

    try {
      const stagedArchive = await this.stageContainerWorkspaceArchive(
        session.containerId,
        `agentloom-workspace-snapshot-${snapshot.id}`,
      );

      try {
        await this.storageService.upload(
          storageKey,
          createReadStream(stagedArchive.filePath),
          stagedArchive.sizeBytes,
          'application/x-tar',
        );
      } finally {
        await stagedArchive.cleanup();
      }

      const [updated] = await tenantDb
        .update(schema.workspaceSnapshots)
        .set({
          storageKey,
          sizeBytes: stagedArchive.sizeBytes,
          status: 'ready',
          updatedAt: new Date(),
        })
        .where(eq(schema.workspaceSnapshots.id, snapshot.id))
        .returning();

      this.logger.log(
        `Workspace snapshot ${snapshot.id} created from sandbox ${sandboxSessionId}`,
      );

      return updated;
    } catch (error) {
      await tenantDb
        .update(schema.workspaceSnapshots)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(schema.workspaceSnapshots.id, snapshot.id));

      try {
        await this.storageService.delete(storageKey);
      } catch {
        // best-effort MinIO cleanup
      }

      this.logger.error(
        `Failed to create workspace snapshot from sandbox ${sandboxSessionId}`,
        error instanceof Error ? error.stack : error,
      );

      throw error;
    }
  }

  async syncFromSandboxContainer(
    workspaceId: string,
    containerId: string,
    tenantId: string,
  ): Promise<schema.WorkspaceSnapshot> {
    const tenantDb = getTenantDb(this.db);
    const [snapshot] = await tenantDb
      .select()
      .from(schema.workspaceSnapshots)
      .where(
        and(
          eq(schema.workspaceSnapshots.id, workspaceId),
          eq(schema.workspaceSnapshots.tenantId, tenantId),
          eq(schema.workspaceSnapshots.status, 'ready'),
        ),
      )
      .limit(1);

    if (!snapshot) {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found or not ready`,
      );
    }

    this.logger.log(
      `Syncing workspace ${workspaceId} from container ${containerId}`,
    );

    const stagedArchive = await this.stageContainerWorkspaceArchive(
      containerId,
      `agentloom-workspace-sync-${workspaceId}`,
    );
    const targetStorageKey = this.buildCanonicalWorkspaceStorageKey(snapshot);

    try {
      await this.storageService.upload(
        targetStorageKey,
        createReadStream(stagedArchive.filePath),
        stagedArchive.sizeBytes,
        'application/x-tar',
      );

      const [updated] = await tenantDb
        .update(schema.workspaceSnapshots)
        .set({
          storageKey: targetStorageKey,
          sizeBytes: stagedArchive.sizeBytes,
          status: 'ready',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.workspaceSnapshots.id, workspaceId),
            eq(schema.workspaceSnapshots.tenantId, tenantId),
          ),
        )
        .returning();

      this.logger.log(
        `Workspace ${workspaceId} synced from container ${containerId}`,
      );

      return updated;
    } finally {
      await stagedArchive.cleanup();
    }
  }

  async restoreToSandbox(
    workspaceId: string,
    containerId: string,
    tenantId: string,
  ): Promise<void> {
    const snapshot = await this.findWorkspaceSnapshotRecord(
      tenantId,
      workspaceId,
      {
        repairLegacySharedEmptyStorageKey: true,
      },
    );

    if (snapshot.status !== 'ready') {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found or not ready`,
      );
    }

    this.logger.log(
      `Restoring workspace ${workspaceId} to container ${containerId}`,
    );

    if (snapshot.sizeBytes === 0) {
      this.logger.log(
        `Workspace ${workspaceId} is empty, skipping archive restore for container ${containerId}`,
      );
      return;
    }

    const archiveStream = await this.storageService.download(
      snapshot.storageKey,
    );
    const stagedArchive = await this.stageRestoreArchive(
      workspaceId,
      archiveStream,
    );
    const containerArchivePath = `${CONTAINER_TEMP_ROOT}/${stagedArchive.containerFileName}`;

    try {
      await this.dockerService.putArchive(
        containerId,
        createReadStream(stagedArchive.uploadArchivePath),
        CONTAINER_TEMP_ROOT,
      );

      await this.execInContainer(containerId, 'sh', [
        '-lc',
        [
          'set -eu',
          `test -f ${this.quoteShellPath(containerArchivePath)}`,
          `mkdir -p ${this.quoteShellPath(CONTAINER_WORKSPACE)}`,
          `find ${this.quoteShellPath(CONTAINER_WORKSPACE)} -mindepth 1 -maxdepth 1 -exec rm -rf {} +`,
          `tar -xf ${this.quoteShellPath(containerArchivePath)} -C ${this.quoteShellPath(CONTAINER_WORKSPACE)} --strip-components=1`,
        ].join('; '),
      ]);
    } finally {
      await stagedArchive.cleanup();
      try {
        await this.execInContainer(containerId, 'sh', [
          '-lc',
          `rm -f ${this.quoteShellPath(containerArchivePath)}`,
        ]);
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to cleanup temporary workspace restore files in container ${containerId}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }

    this.logger.log(
      `Workspace ${workspaceId} restored to container ${containerId}`,
    );
  }

  private async execInContainer(
    containerId: string,
    command: string,
    args: string[],
  ): Promise<string> {
    const handle = await this.dockerService.createExec(containerId, {
      command,
      args,
    });

    const outputChunks: string[] = [];

    await this.dockerService.attachExecOutput(
      handle.execId,
      (_level, message) => {
        outputChunks.push(message);
      },
    );

    const exitInfo = await this.dockerService.waitForExecExit(handle.execId);

    if (exitInfo.exitCode !== 0) {
      throw new Error(
        `Container command failed (exit=${exitInfo.exitCode}): ${outputChunks.join('').slice(0, 400)}`,
      );
    }

    return outputChunks.join('');
  }

  private async stageContainerWorkspaceArchive(
    containerId: string,
    prefix: string,
  ): Promise<{
    tempDir: string;
    filePath: string;
    sizeBytes: number;
    cleanup: () => Promise<void>;
  }> {
    const archiveStream = await this.dockerService.getArchive(
      containerId,
      CONTAINER_WORKSPACE,
    );

    return this.stageStreamToTempFile(prefix, 'snapshot.tar', archiveStream);
  }

  private async stageRestoreArchive(
    workspaceId: string,
    archiveStream: Readable,
  ): Promise<{
    uploadArchivePath: string;
    containerFileName: string;
    cleanup: () => Promise<void>;
  }> {
    const containerFileName = `agentloom-workspace-restore-${workspaceId}.tar`;
    const stagedArchive = await this.stageStreamToTempFile(
      `agentloom-workspace-restore-${workspaceId}`,
      containerFileName,
      archiveStream,
    );
    const uploadArchivePath = join(stagedArchive.tempDir, 'upload.tar');

    try {
      await this.createUploadArchive(
        stagedArchive.tempDir,
        containerFileName,
        uploadArchivePath,
      );
    } catch (error) {
      await stagedArchive.cleanup();
      throw error;
    }

    return {
      uploadArchivePath,
      containerFileName,
      cleanup: stagedArchive.cleanup,
    };
  }

  private async stageWorkspaceArchiveForEdit(
    snapshot: schema.WorkspaceSnapshot,
  ): Promise<{
    tempDir: string;
    extractRoot: string;
    workspaceRoot: string;
    archiveEntryName: string;
    cleanup: () => Promise<void>;
  }> {
    const stagedArchive = await this.stageStreamToTempFile(
      `agentloom-workspace-edit-${snapshot.id}`,
      'snapshot.tar',
      await this.storageService.download(snapshot.storageKey),
    );
    const extractRoot = join(stagedArchive.tempDir, 'workspace-extracted');
    await mkdir(extractRoot, { recursive: true });

    try {
      await this.runTarCommand(
        ['-xf', stagedArchive.filePath, '-C', extractRoot],
        'Failed to extract workspace archive for editing',
      );
    } catch (error) {
      await stagedArchive.cleanup();
      throw error;
    }

    const workspaceDir = join(extractRoot, 'workspace');

    try {
      const directoryStats = await stat(workspaceDir);
      if (directoryStats.isDirectory()) {
        return {
          tempDir: stagedArchive.tempDir,
          extractRoot,
          workspaceRoot: workspaceDir,
          archiveEntryName: 'workspace',
          cleanup: stagedArchive.cleanup,
        };
      }
    } catch {
      // Rootless archives fall back to extractRoot as the editable workspace root.
    }

    return {
      tempDir: stagedArchive.tempDir,
      extractRoot,
      workspaceRoot: extractRoot,
      archiveEntryName: '.',
      cleanup: stagedArchive.cleanup,
    };
  }

  private async stageStreamToTempFile(
    prefix: string,
    fileName: string,
    archiveStream: Readable,
  ): Promise<{
    tempDir: string;
    filePath: string;
    sizeBytes: number;
    cleanup: () => Promise<void>;
  }> {
    const tempDir = await mkdtemp(join(tmpdir(), `${prefix}-`));
    const filePath = join(tempDir, fileName);

    try {
      await pipeline(archiveStream, createWriteStream(filePath));
      const fileStats = await stat(filePath);

      return {
        tempDir,
        filePath,
        sizeBytes: fileStats.size,
        cleanup: async () => {
          await rm(tempDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  private async createUploadArchive(
    sourceDir: string,
    fileName: string,
    archivePath: string,
  ): Promise<void> {
    await this.runTarCommand(
      ['-cf', archivePath, '-C', sourceDir, fileName],
      'Failed to prepare workspace archive',
    );
  }

  private async runTarCommand(
    args: string[],
    errorPrefix: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', args, {
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
            `${errorPrefix}${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
          ),
        );
      });
    });
  }

  private quoteShellPath(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  async createEmpty(
    tenantId: string,
    organizationId: string,
    userId: string,
    name: string,
    description?: string,
  ): Promise<schema.WorkspaceSnapshot> {
    const tenantDb = getTenantDb(this.db);

    const [snapshot] = await tenantDb
      .insert(schema.workspaceSnapshots)
      .values({
        organizationId,
        tenantId,
        name,
        description: description ?? null,
        storageKey: 'pending',
        status: 'ready',
        sizeBytes: 0,
        createdById: userId,
      })
      .returning();
    const targetStorageKey = this.buildCanonicalWorkspaceStorageKey(snapshot);
    const [updated] = await tenantDb
      .update(schema.workspaceSnapshots)
      .set({
        storageKey: targetStorageKey,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.workspaceSnapshots.id, snapshot.id),
          eq(schema.workspaceSnapshots.tenantId, tenantId),
        ),
      )
      .returning();

    this.logger.log(`Empty workspace snapshot ${snapshot.id} created`);

    return updated ?? snapshot;
  }

  async delete(tenantId: string, workspaceId: string): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [snapshot] = await tenantDb
      .select()
      .from(schema.workspaceSnapshots)
      .where(
        and(
          eq(schema.workspaceSnapshots.id, workspaceId),
          eq(schema.workspaceSnapshots.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!snapshot) {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found`,
      );
    }

    if (
      isLegacyEmptyWorkspaceStorageKey(snapshot.tenantId, snapshot.storageKey)
    ) {
      this.logger.warn(
        `Skipping object deletion for legacy shared-empty workspace ${workspaceId}`,
      );
    } else {
      try {
        await this.storageService.delete(snapshot.storageKey);
      } catch (error) {
        this.logger.warn(
          `Failed to delete MinIO object for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await tenantDb
      .update(schema.workspaceSnapshots)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(schema.workspaceSnapshots.id, workspaceId));

    this.logger.log(`Workspace snapshot ${workspaceId} deleted`);
  }

  async findAll(
    tenantId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      includeAutoArchived?: boolean;
    } = {},
  ): Promise<{ data: WorkspaceListItem[]; total: number }> {
    const tenantDb = getTenantDb(this.db);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions = [ne(schema.workspaceSnapshots.status, 'deleted')];

    if (options.search) {
      conditions.push(
        sql`${schema.workspaceSnapshots.name} ILIKE ${'%' + options.search + '%'}`,
      );
    }

    if (options.includeAutoArchived === false) {
      conditions.push(
        sql`${schema.workspaceSnapshots.name} NOT ILIKE 'execution-%-step-%-workspace'`,
      );
    }

    const predicate = and(...conditions);

    const [data, [countRow]] = await Promise.all([
      tenantDb
        .select()
        .from(schema.workspaceSnapshots)
        .where(predicate)
        .orderBy(desc(schema.workspaceSnapshots.createdAt))
        .limit(pageSize)
        .offset(offset),
      tenantDb
        .select({ total: count() })
        .from(schema.workspaceSnapshots)
        .where(predicate),
    ]);

    return {
      data: data.map(enrichWorkspaceSnapshot),
      total: countRow?.total ?? 0,
    };
  }

  async findOne(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceListItem> {
    const snapshot = await this.findWorkspaceSnapshotRecord(
      tenantId,
      workspaceId,
      { repairLegacySharedEmptyStorageKey: true },
    );
    return enrichWorkspaceSnapshot(snapshot);
  }

  async getFileTree(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceFileTreeNode[]> {
    const activeContainerId = await this.findActiveWorkspaceContainerId(
      tenantId,
      workspaceId,
    );

    if (activeContainerId) {
      try {
        const entries =
          await this.readLiveWorkspaceSnapshotTreeEntries(activeContainerId);
        return buildWorkspaceFileTree(entries);
      } catch (error) {
        this.logger.warn(
          `Failed to read live workspace tree for ${workspaceId} from container ${activeContainerId}, falling back to snapshot: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const entries = await this.readWorkspaceSnapshotTreeEntries(
      tenantId,
      workspaceId,
    );
    return buildWorkspaceFileTree(entries);
  }

  async getFilePreview(
    tenantId: string,
    workspaceId: string,
    filePath: string,
  ): Promise<WorkspaceFilePreview> {
    const activeContainerId = await this.findActiveWorkspaceContainerId(
      tenantId,
      workspaceId,
    );

    if (activeContainerId) {
      try {
        const { normalizedPath, entry } = await this.readLiveWorkspaceFileEntry(
          activeContainerId,
          filePath,
        );
        return buildWorkspaceFilePreview(normalizedPath, entry);
      } catch (error) {
        this.logger.warn(
          `Failed to read live workspace preview for ${workspaceId}/${filePath} from container ${activeContainerId}, falling back to snapshot: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const { normalizedPath, entry } = await this.readWorkspaceFileEntry(
      tenantId,
      workspaceId,
      filePath,
    );
    return buildWorkspaceFilePreview(normalizedPath, entry);
  }

  async getFileAsset(
    tenantId: string,
    workspaceId: string,
    filePath: string,
  ): Promise<WorkspaceFileAsset> {
    const activeContainerId = await this.findActiveWorkspaceContainerId(
      tenantId,
      workspaceId,
    );

    if (activeContainerId) {
      try {
        const { normalizedPath, entry } = await this.readLiveWorkspaceFileEntry(
          activeContainerId,
          filePath,
        );
        return {
          path: normalizedPath,
          fileName: basename(normalizedPath),
          size: entry.size,
          mimeType: detectWorkspaceMimeType(normalizedPath, entry.content),
          content: Buffer.from(entry.content),
        };
      } catch (error) {
        this.logger.warn(
          `Failed to read live workspace asset for ${workspaceId}/${filePath} from container ${activeContainerId}, falling back to snapshot: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const { normalizedPath, entry } = await this.readWorkspaceFileEntry(
      tenantId,
      workspaceId,
      filePath,
    );

    return {
      path: normalizedPath,
      fileName: basename(normalizedPath),
      size: entry.size,
      mimeType: detectWorkspaceMimeType(normalizedPath, entry.content),
      content: Buffer.from(entry.content),
    };
  }

  async updateTextFile(
    tenantId: string,
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFilePreview> {
    const snapshot = await this.findWorkspaceSnapshotRecord(
      tenantId,
      workspaceId,
      { repairLegacySharedEmptyStorageKey: true },
    );

    if (snapshot.status !== 'ready') {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found or not ready`,
      );
    }

    if (snapshot.sizeBytes === 0) {
      throw new NotFoundException(`路径 ${filePath} 不是普通文件`);
    }

    const normalizedPath = normalizeWorkspacePreviewPath(filePath);
    const tenantDb = getTenantDb(this.db);
    const stagedWorkspace = await this.stageWorkspaceArchiveForEdit(snapshot);
    const targetStorageKey = this.buildCanonicalWorkspaceStorageKey(snapshot);

    try {
      const targetPath = join(stagedWorkspace.workspaceRoot, normalizedPath);
      const currentStats = await this.readWorkspaceFileStats(
        targetPath,
        filePath,
      );
      const currentContent = await readFile(targetPath);
      const currentPreview = buildWorkspaceFilePreview(normalizedPath, {
        path: normalizedPath,
        type: 'file',
        size: currentStats.size,
        content: currentContent,
      });

      if (currentPreview.kind !== 'text') {
        throw new BadRequestException(
          `路径 ${normalizedPath} 不是可编辑的文本文件`,
        );
      }

      const nextContent = Buffer.from(content, 'utf-8');
      const nextPreview = buildWorkspaceFilePreview(normalizedPath, {
        path: normalizedPath,
        type: 'file',
        size: nextContent.length,
        content: nextContent,
      });

      if (nextPreview.kind !== 'text') {
        throw new BadRequestException(
          nextPreview.kind === 'unsupported'
            ? nextPreview.reason
            : '仅支持保存 UTF-8 文本文件',
        );
      }

      await writeFile(targetPath, nextContent);

      const nextArchivePath = join(stagedWorkspace.tempDir, 'updated.tar');
      await this.createUploadArchive(
        stagedWorkspace.extractRoot,
        stagedWorkspace.archiveEntryName,
        nextArchivePath,
      );
      const nextArchiveStats = await stat(nextArchivePath);

      await this.storageService.upload(
        targetStorageKey,
        createReadStream(nextArchivePath),
        nextArchiveStats.size,
        'application/x-tar',
      );

      await tenantDb
        .update(schema.workspaceSnapshots)
        .set({
          storageKey: targetStorageKey,
          sizeBytes: nextArchiveStats.size,
          status: 'ready',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.workspaceSnapshots.id, workspaceId),
            eq(schema.workspaceSnapshots.tenantId, tenantId),
          ),
        );

      this.logger.log(
        `Workspace ${workspaceId} text file ${normalizedPath} updated`,
      );

      return nextPreview;
    } finally {
      await stagedWorkspace.cleanup();
    }
  }

  private async findWorkspaceSnapshotRecord(
    tenantId: string,
    workspaceId: string,
    options?: {
      repairLegacySharedEmptyStorageKey?: boolean;
    },
  ): Promise<schema.WorkspaceSnapshot> {
    const tenantDb = getTenantDb(this.db);
    const [snapshot] = await tenantDb
      .select()
      .from(schema.workspaceSnapshots)
      .where(
        and(
          eq(schema.workspaceSnapshots.id, workspaceId),
          eq(schema.workspaceSnapshots.tenantId, tenantId),
          ne(schema.workspaceSnapshots.status, 'deleted'),
        ),
      )
      .limit(1);

    if (!snapshot) {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found`,
      );
    }

    if (options?.repairLegacySharedEmptyStorageKey) {
      return this.maybeRepairLegacySharedEmptyStorageKey(snapshot);
    }

    return snapshot;
  }

  private async readWorkspaceSnapshotTreeEntries(
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceArchiveEntry[]> {
    const snapshot = await this.findWorkspaceSnapshotRecord(
      tenantId,
      workspaceId,
      { repairLegacySharedEmptyStorageKey: true },
    );

    if (snapshot.status !== 'ready') {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found or not ready`,
      );
    }

    if (snapshot.sizeBytes === 0) {
      return [];
    }

    const archiveStream = await this.storageService.download(
      snapshot.storageKey,
    );
    return parseWorkspaceArchiveEntriesFromStream(archiveStream);
  }

  private async readLiveWorkspaceSnapshotTreeEntries(
    containerId: string,
  ): Promise<WorkspaceArchiveEntry[]> {
    const archiveStream = await this.dockerService.getArchive(
      containerId,
      CONTAINER_WORKSPACE,
    );
    return parseWorkspaceArchiveEntriesFromStream(archiveStream);
  }

  private async readWorkspaceFileEntry(
    tenantId: string,
    workspaceId: string,
    filePath: string,
  ): Promise<{ normalizedPath: string; entry: WorkspaceArchiveEntry }> {
    const snapshot = await this.findWorkspaceSnapshotRecord(
      tenantId,
      workspaceId,
      { repairLegacySharedEmptyStorageKey: true },
    );

    if (snapshot.status !== 'ready') {
      throw new NotFoundException(
        `Workspace snapshot ${workspaceId} not found or not ready`,
      );
    }

    if (snapshot.sizeBytes === 0) {
      throw new NotFoundException(`路径 ${filePath} 不是普通文件`);
    }

    const archiveStream = await this.storageService.download(
      snapshot.storageKey,
    );
    return findWorkspaceArchiveFileEntryFromStream(
      archiveStream,
      normalizeWorkspacePreviewPath(filePath),
    );
  }

  private async readLiveWorkspaceFileEntry(
    containerId: string,
    filePath: string,
  ): Promise<{ normalizedPath: string; entry: WorkspaceArchiveEntry }> {
    const normalizedPath = normalizeWorkspacePreviewPath(filePath);
    const archiveStream = await this.dockerService.getArchive(
      containerId,
      `${CONTAINER_WORKSPACE}${normalizedPath}`,
    );
    const entries = parseWorkspaceArchiveEntries(
      await this.readReadableToBuffer(archiveStream),
    );
    const fileEntries = entries.filter(
      (candidate) => candidate.type === 'file',
    );
    const entry =
      fileEntries.find((candidate) => candidate.path === normalizedPath) ??
      (fileEntries.length === 1 ? fileEntries[0] : undefined);

    if (!entry) {
      throw new NotFoundException(`路径 ${filePath} 不是普通文件`);
    }

    return {
      normalizedPath,
      entry,
    };
  }

  private async readWorkspaceFileStats(
    filePath: string,
    rawInputPath: string,
  ): Promise<{ size: number }> {
    let fileStats;
    try {
      fileStats = await stat(filePath);
    } catch {
      throw new NotFoundException(`路径 ${rawInputPath} 不是普通文件`);
    }

    if (!fileStats.isFile()) {
      throw new NotFoundException(`路径 ${rawInputPath} 不是普通文件`);
    }

    return { size: fileStats.size };
  }

  private buildCanonicalWorkspaceStorageKey(
    snapshot: Pick<schema.WorkspaceSnapshot, 'tenantId' | 'id'>,
  ): string {
    return buildWorkspaceStorageKey(snapshot.tenantId, snapshot.id);
  }

  private async findActiveWorkspaceContainerId(
    tenantId: string,
    workspaceId: string,
  ): Promise<string | null> {
    const tenantDb = getTenantDb(this.db);
    const result = await tenantDb.execute(sql`
      select container_id as "containerId"
      from sandbox_sessions
      where tenant_id = ${tenantId}
        and container_id is not null
        and status not in ('stopping', 'stopped', 'failed')
        and config->>'restoreWorkspaceId' = ${workspaceId}
      limit 1
    `);
    const [row] = this.readExecuteRows<{ containerId?: string }>(result);

    return typeof row?.containerId === 'string' &&
      row.containerId.trim().length > 0
      ? row.containerId
      : null;
  }

  private readExecuteRows<T extends Record<string, unknown>>(
    result: unknown,
  ): T[] {
    if (Array.isArray(result)) {
      return result as T[];
    }

    if (
      result &&
      typeof result === 'object' &&
      'rows' in result &&
      Array.isArray((result as { rows?: unknown[] }).rows)
    ) {
      return (result as { rows: T[] }).rows;
    }

    return [];
  }

  private async readReadableToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
        continue;
      }

      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
        continue;
      }

      chunks.push(Buffer.from(String(chunk)));
    }

    return Buffer.concat(chunks);
  }

  private async maybeRepairLegacySharedEmptyStorageKey(
    snapshot: schema.WorkspaceSnapshot,
  ): Promise<schema.WorkspaceSnapshot> {
    if (
      !isLegacyEmptyWorkspaceStorageKey(snapshot.tenantId, snapshot.storageKey)
    ) {
      return snapshot;
    }

    const tenantDb = getTenantDb(this.db);
    const targetStorageKey = this.buildCanonicalWorkspaceStorageKey(snapshot);
    let nextSizeBytes = snapshot.sizeBytes ?? 0;

    try {
      if (snapshot.sizeBytes !== 0) {
        const stagedArchive = await this.stageStreamToTempFile(
          `agentloom-workspace-rehome-${snapshot.id}`,
          WORKSPACE_SNAPSHOT_FILENAME,
          await this.storageService.download(snapshot.storageKey),
        );

        try {
          await this.storageService.upload(
            targetStorageKey,
            createReadStream(stagedArchive.filePath),
            stagedArchive.sizeBytes,
            'application/x-tar',
          );
          nextSizeBytes = stagedArchive.sizeBytes;
        } finally {
          await stagedArchive.cleanup();
        }
      }

      const [updated] = await tenantDb
        .update(schema.workspaceSnapshots)
        .set({
          storageKey: targetStorageKey,
          sizeBytes: nextSizeBytes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.workspaceSnapshots.id, snapshot.id),
            eq(schema.workspaceSnapshots.tenantId, snapshot.tenantId),
          ),
        )
        .returning();

      if (!updated) {
        return snapshot;
      }

      this.logger.warn(
        `Legacy shared-empty workspace ${snapshot.id} re-homed to ${targetStorageKey}`,
      );

      return updated;
    } catch (error) {
      this.logger.warn(
        `Failed to re-home legacy shared-empty workspace ${snapshot.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return snapshot;
    }
  }
}
