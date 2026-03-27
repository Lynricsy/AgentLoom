import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { DockerService } from '../sandbox/docker.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type { SandboxConfig } from '../../database/schema';

const CONTAINER_WORKSPACE = '/workspace';
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
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
  conversationId: string;
  tenantId: string;
  changedFiles: string[];
  timestamp: string;
}

@Injectable()
export class WorkspaceIntegrationService {
  private readonly logger = new Logger(WorkspaceIntegrationService.name);

  private readonly activeWatchers = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  constructor(
    private readonly dockerService: DockerService,
    private readonly sandboxService: SandboxService,
    private readonly workspaceService: WorkspaceService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getFileTree(
    conversationId: string,
    tenantId: string,
  ): Promise<FileTreeNode[]> {
    const containerId = await this.resolveContainerId(conversationId, tenantId);

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

  async getFileContent(
    conversationId: string,
    tenantId: string,
    filePath: string,
  ): Promise<FileContentResult> {
    const containerId = await this.resolveContainerId(conversationId, tenantId);

    // Security: path traversal prevention
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

    // Security: binary detection via null-byte scan on first 8KB
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

  startFileWatcher(
    conversationId: string,
    tenantId: string,
    containerId: string,
  ): void {
    if (this.activeWatchers.has(conversationId)) {
      this.logger.debug(`文件监听器已存在: conversation=${conversationId}`);
      return;
    }

    this.initMarkerFile(containerId).catch((err) =>
      this.logger.warn(
        `创建标记文件失败: conversation=${conversationId}, error=${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    const timer = setInterval(async () => {
      try {
        await this.pollFileChanges(conversationId, tenantId, containerId);
      } catch (error) {
        this.logger.warn(
          `文件变更轮询失败: conversation=${conversationId}, error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, FILE_WATCH_POLL_INTERVAL_MS);

    this.activeWatchers.set(conversationId, timer);
    this.logger.log(`文件监听器已启动: conversation=${conversationId}`);
  }

  stopFileWatcher(conversationId: string): void {
    const timer = this.activeWatchers.get(conversationId);
    if (timer) {
      clearInterval(timer);
      this.activeWatchers.delete(conversationId);
      this.logger.log(`文件监听器已停止: conversation=${conversationId}`);
    }
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
    for (const [conversationId, timer] of this.activeWatchers) {
      clearInterval(timer);
      this.logger.debug(`文件监听器已清理: conversation=${conversationId}`);
    }
    this.activeWatchers.clear();
  }

  private async resolveContainerId(
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

  private async pollFileChanges(
    conversationId: string,
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
        conversationId,
        tenantId,
        changedFiles,
        timestamp: new Date().toISOString(),
      };

      this.eventEmitter.emit('workspace.file_change', event);

      this.logger.debug(
        `文件变更检测到: conversation=${conversationId}, files=${changedFiles.length}`,
      );
    }
  }
}
