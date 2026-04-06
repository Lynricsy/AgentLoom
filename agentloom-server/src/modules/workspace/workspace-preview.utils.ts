import { NotFoundException } from '@nestjs/common';
import { basename, extname } from 'node:path';

export const MAX_WORKSPACE_TEXT_PREVIEW_BYTES = 10 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/x-scss',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.jsx': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.sh': 'text/x-shellscript',
  '.py': 'text/x-python',
  '.rs': 'text/plain',
  '.go': 'text/plain',
  '.java': 'text/plain',
  '.sql': 'application/sql',
  '.toml': 'text/plain',
  '.log': 'text/plain',
};

export type WorkspacePreviewKind = 'text' | 'image' | 'pdf' | 'unsupported';

export interface WorkspaceFileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: WorkspaceFileTreeNode[];
}

export interface WorkspaceArchiveEntry {
  path: string;
  type: 'file' | 'directory';
  size: number;
  content: Buffer;
}

interface WorkspaceFilePreviewBase {
  kind: WorkspacePreviewKind;
  path: string;
  fileName: string;
  size: number;
  mimeType: string;
  canDownload: boolean;
}

export interface WorkspaceTextFilePreview extends WorkspaceFilePreviewBase {
  kind: 'text';
  content: string;
  encoding: 'utf-8';
}

export interface WorkspaceBinaryFilePreview extends WorkspaceFilePreviewBase {
  kind: 'image' | 'pdf';
}

export interface WorkspaceUnsupportedFilePreview extends WorkspaceFilePreviewBase {
  kind: 'unsupported';
  reason: string;
}

export type WorkspaceFilePreview =
  | WorkspaceTextFilePreview
  | WorkspaceBinaryFilePreview
  | WorkspaceUnsupportedFilePreview;

export interface WorkspaceFileAsset {
  path: string;
  fileName: string;
  size: number;
  mimeType: string;
  content: Buffer;
}

export function normalizeWorkspacePreviewPath(filePath: string): string {
  let normalized = filePath.replace(/^\/+/, '');

  const segments = normalized.split('/').filter(Boolean);
  const resolved: string[] = [];

  for (const segment of segments) {
    if (segment === '..') {
      if (resolved.length === 0) {
        throw new NotFoundException('路径穿越被拒绝：不允许访问工作区外的文件');
      }
      resolved.pop();
      continue;
    }

    if (segment !== '.') {
      resolved.push(segment);
    }
  }

  normalized = resolved.join('/');

  if (!normalized) {
    throw new NotFoundException('文件路径不能为空');
  }

  return normalized;
}

export function isBinaryWorkspaceFile(buffer: Buffer): boolean {
  return buffer.includes(0);
}

export function detectWorkspaceMimeType(
  filePath: string,
  content?: Buffer,
): string {
  const lowerPath = filePath.toLowerCase();
  const extension = extname(lowerPath);

  if (extension === '.pdf') {
    return 'application/pdf';
  }

  if (extension in IMAGE_MIME_BY_EXTENSION) {
    return IMAGE_MIME_BY_EXTENSION[extension]!;
  }

  if (extension in TEXT_MIME_BY_EXTENSION) {
    return TEXT_MIME_BY_EXTENSION[extension]!;
  }

  if (content && !isBinaryWorkspaceFile(content.subarray(0, 8192))) {
    return 'text/plain';
  }

  return 'application/octet-stream';
}

export function parseWorkspaceArchiveEntries(
  archiveBuffer: Buffer,
): WorkspaceArchiveEntry[] {
  const rawEntries: WorkspaceArchiveEntry[] = [];
  let offset = 0;

  while (offset + 512 <= archiveBuffer.length) {
    const header = archiveBuffer.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) {
      break;
    }

    const name = readTarString(header.subarray(0, 100));
    const prefix = readTarString(header.subarray(345, 500));
    const fullPath = [prefix, name].filter(Boolean).join('/');
    const size = readTarOctal(header.subarray(124, 136));
    const typeFlagByte = header[156] ?? 0;
    const typeFlag =
      typeFlagByte === 0 ? '0' : String.fromCharCode(typeFlagByte);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    if (dataEnd > archiveBuffer.length) {
      throw new NotFoundException('工作区快照已损坏，无法解析');
    }

    const normalizedPath = normalizeArchivePath(fullPath);
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

  return stripWorkspaceRootIfNeeded(rawEntries);
}

class WorkspaceArchiveStreamReader {
  private readonly iterator: AsyncIterator<unknown>;
  private readonly chunks: Buffer[] = [];
  private headOffset = 0;
  private availableBytes = 0;
  private done = false;

  constructor(stream: AsyncIterable<unknown>) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  async read(size: number): Promise<Buffer | null> {
    if (size === 0) {
      return Buffer.alloc(0);
    }

    const result = Buffer.allocUnsafe(size);
    let written = 0;

    while (written < size) {
      const hasData = await this.ensureData();
      if (!hasData) {
        if (written === 0) {
          return null;
        }
        throw new NotFoundException('工作区快照已损坏，无法解析');
      }

      const head = this.chunks[0];
      if (!head) {
        throw new NotFoundException('工作区快照已损坏，无法解析');
      }

      const availableInHead = head.length - this.headOffset;
      const consume = Math.min(size - written, availableInHead);
      head.copy(result, written, this.headOffset, this.headOffset + consume);
      written += consume;
      this.consume(consume);
    }

    return result;
  }

  async skip(size: number): Promise<void> {
    let remaining = size;
    while (remaining > 0) {
      const hasData = await this.ensureData();
      if (!hasData) {
        throw new NotFoundException('工作区快照已损坏，无法解析');
      }

      const head = this.chunks[0];
      if (!head) {
        throw new NotFoundException('工作区快照已损坏，无法解析');
      }

      const availableInHead = head.length - this.headOffset;
      const consume = Math.min(remaining, availableInHead);
      remaining -= consume;
      this.consume(consume);
    }
  }

  private async ensureData(): Promise<boolean> {
    while (this.availableBytes === 0 && !this.done) {
      const { value, done } = await this.iterator.next();
      if (done) {
        this.done = true;
        break;
      }

      const buffer = toWorkspaceArchiveBuffer(value);
      if (buffer.length === 0) {
        continue;
      }

      this.chunks.push(buffer);
      this.availableBytes += buffer.length;
    }

    return this.availableBytes > 0;
  }

  private consume(size: number): void {
    this.availableBytes -= size;
    this.headOffset += size;

    const head = this.chunks[0];
    if (head && this.headOffset >= head.length) {
      this.chunks.shift();
      this.headOffset = 0;
    }
  }
}

export async function parseWorkspaceArchiveEntriesFromStream(
  stream: AsyncIterable<unknown>,
): Promise<WorkspaceArchiveEntry[]> {
  const reader = new WorkspaceArchiveStreamReader(stream);
  const entries: WorkspaceArchiveEntry[] = [];

  while (true) {
    const header = await reader.read(512);
    if (!header) {
      break;
    }

    if (header.every((value) => value === 0)) {
      break;
    }

    const entryHeader = parseWorkspaceArchiveHeader(header);
    if (entryHeader.type === 'directory' && entryHeader.path) {
      entries.push({
        path: entryHeader.path,
        type: 'directory',
        size: 0,
        content: Buffer.alloc(0),
      });
    } else if (entryHeader.type === 'file' && entryHeader.path) {
      entries.push({
        path: entryHeader.path,
        type: 'file',
        size: entryHeader.size,
        content: Buffer.alloc(0),
      });
    }

    await reader.skip(entryHeader.size + computeTarPadding(entryHeader.size));
  }

  return stripWorkspaceRootIfNeeded(entries);
}

export async function findWorkspaceArchiveFileEntryFromStream(
  stream: AsyncIterable<unknown>,
  filePath: string,
): Promise<{ normalizedPath: string; entry: WorkspaceArchiveEntry }> {
  const normalizedPath = normalizeWorkspacePreviewPath(filePath);
  const candidatePaths = buildWorkspaceArchivePathAliases(normalizedPath);
  const reader = new WorkspaceArchiveStreamReader(stream);

  while (true) {
    const header = await reader.read(512);
    if (!header) {
      break;
    }

    if (header.every((value) => value === 0)) {
      break;
    }

    const entryHeader = parseWorkspaceArchiveHeader(header);
    const shouldReadContent =
      entryHeader.type === 'file' &&
      entryHeader.path !== null &&
      candidatePaths.has(entryHeader.path);

    if (shouldReadContent) {
      const content = (await reader.read(entryHeader.size)) ?? Buffer.alloc(0);
      await reader.skip(computeTarPadding(entryHeader.size));
      return {
        normalizedPath,
        entry: {
          path: entryHeader.path!,
          type: 'file',
          size: entryHeader.size,
          content,
        },
      };
    }

    await reader.skip(entryHeader.size + computeTarPadding(entryHeader.size));
  }

  throw new NotFoundException(`路径 ${filePath} 不是普通文件`);
}

export function buildWorkspaceFileTree(
  entries: WorkspaceArchiveEntry[],
): WorkspaceFileTreeNode[] {
  const root: WorkspaceFileTreeNode[] = [];
  const directoryMap = new Map<string, WorkspaceFileTreeNode>();
  const fileSet = new Set<string>();

  const ensureDirectory = (dirPath: string): WorkspaceFileTreeNode => {
    const existing = directoryMap.get(dirPath);
    if (existing) {
      return existing;
    }

    const segments = dirPath.split('/');
    const name = segments[segments.length - 1] ?? dirPath;
    const parentPath = segments.slice(0, -1).join('/');
    const node: WorkspaceFileTreeNode = {
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

    const node: WorkspaceFileTreeNode = {
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

export function buildWorkspaceFilePreview(
  filePath: string,
  entry: WorkspaceArchiveEntry,
): WorkspaceFilePreview {
  const normalizedPath = normalizeWorkspacePreviewPath(filePath);
  const fileName = basename(normalizedPath);
  const mimeType = detectWorkspaceMimeType(normalizedPath, entry.content);
  const previewKind = detectWorkspacePreviewKind(
    normalizedPath,
    entry.content,
    mimeType,
  );

  if (previewKind === 'text') {
    if (entry.size > MAX_WORKSPACE_TEXT_PREVIEW_BYTES) {
      return {
        kind: 'unsupported',
        path: normalizedPath,
        fileName,
        size: entry.size,
        mimeType,
        canDownload: true,
        reason: `文本文件超过在线预览限制 (${MAX_WORKSPACE_TEXT_PREVIEW_BYTES} 字节)`,
      };
    }

    return {
      kind: 'text',
      path: normalizedPath,
      fileName,
      size: entry.size,
      mimeType,
      canDownload: true,
      content: entry.content.toString('utf-8'),
      encoding: 'utf-8',
    };
  }

  if (previewKind === 'image' || previewKind === 'pdf') {
    return {
      kind: previewKind,
      path: normalizedPath,
      fileName,
      size: entry.size,
      mimeType,
      canDownload: true,
    };
  }

  return {
    kind: 'unsupported',
    path: normalizedPath,
    fileName,
    size: entry.size,
    mimeType,
    canDownload: true,
    reason: '该文件类型暂不支持在线预览，可下载后在本地查看',
  };
}

function detectWorkspacePreviewKind(
  filePath: string,
  content: Buffer,
  mimeType: string,
): WorkspacePreviewKind {
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (!isBinaryWorkspaceFile(content.subarray(0, 8192))) {
    return 'text';
  }

  const lowerPath = filePath.toLowerCase();
  if (extname(lowerPath) in IMAGE_MIME_BY_EXTENSION) {
    return 'image';
  }
  if (lowerPath.endsWith('.pdf')) {
    return 'pdf';
  }

  return 'unsupported';
}

function parseWorkspaceArchiveHeader(header: Buffer): {
  path: string | null;
  size: number;
  type: 'file' | 'directory' | 'other';
} {
  const name = readTarString(header.subarray(0, 100));
  const prefix = readTarString(header.subarray(345, 500));
  const fullPath = [prefix, name].filter(Boolean).join('/');
  const typeFlagByte = header[156] ?? 0;
  const typeFlag = typeFlagByte === 0 ? '0' : String.fromCharCode(typeFlagByte);

  return {
    path: normalizeArchivePath(fullPath),
    size: readTarOctal(header.subarray(124, 136)),
    type: typeFlag === '5' ? 'directory' : typeFlag === '0' ? 'file' : 'other',
  };
}

function computeTarPadding(size: number): number {
  return (512 - (size % 512)) % 512;
}

function buildWorkspaceArchivePathAliases(normalizedPath: string): Set<string> {
  const candidates = new Set<string>([normalizedPath]);

  if (normalizedPath.startsWith('workspace/')) {
    candidates.add(normalizedPath.slice('workspace/'.length));
  } else {
    candidates.add(`workspace/${normalizedPath}`);
  }

  return candidates;
}

function toWorkspaceArchiveBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  return Buffer.from(String(chunk));
}

function stripWorkspaceRootIfNeeded(
  entries: WorkspaceArchiveEntry[],
): WorkspaceArchiveEntry[] {
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
    .filter((entry): entry is WorkspaceArchiveEntry => entry !== null);
}

function normalizeArchivePath(rawPath: string): string | null {
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

function readTarString(buffer: Buffer): string {
  return buffer.toString('utf-8').replace(/\0.*$/, '');
}

function readTarOctal(buffer: Buffer): number {
  const raw = buffer.toString('utf-8').replace(/\0.*$/, '').trim();
  if (!raw) {
    return 0;
  }

  return Number.parseInt(raw, 8);
}
