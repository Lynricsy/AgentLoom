import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import JSZip from 'jszip';

import {
  PluginFileTooLargeException,
  PluginSignatureInvalidException,
  PluginSignatureMissingException,
  PluginSignerMismatchException,
  PluginValidationException,
} from './plugin.exceptions';
import type { PluginDeveloperKeyService } from './plugin-developer-key.service';
import type { PluginSignatureService } from './plugin-signature.service';

/** 已通过 multipart 读取、解析 manifest 并完成签名校验的 .alp 归档。 */
export interface SignedAlpArchive {
  /** multipart 中随文件一起提交的表单字段（如 status） */
  fields: MultipartFile['fields'];
  buffer: Buffer;
  zip: JSZip;
  /** 归档内 manifest.json 原文解析结果（未经 schema 校验） */
  manifest: Record<string, unknown>;
  pluginId: string;
  version: string;
  signature: string;
  /** 验签得出的归档内容哈希（已与 manifest.contentHash 比对一致） */
  contentHash: string;
}

export interface SignedAlpArchiveDeps {
  orgId: string;
  /** 上传者用户 ID：签名公钥必须是其本人注册的开发者密钥 */
  userId: string;
  maxFileSize: number;
  signatureService: PluginSignatureService;
  developerKeyService: PluginDeveloperKeyService;
}

/**
 * 节点插件与 runtime 插件共用的上传入口：
 * 读取 multipart 文件 → 校验 .alp 扩展名与大小 → 解析 manifest.json →
 * 校验签名元数据 → 查找上传者本人的活跃开发者密钥 → 验签并比对 contentHash。
 *
 * 任何一步失败都在上传存储之前抛出领域异常。
 */
export async function readSignedAlpArchive(
  request: FastifyRequest,
  deps: SignedAlpArchiveDeps,
): Promise<SignedAlpArchive> {
  const multipartFile = await readMultipartFile(request);

  if (!(multipartFile.filename ?? '').toLowerCase().endsWith('.alp')) {
    throw new PluginValidationException('插件包必须是 .alp 文件');
  }

  const buffer = await readMultipartBuffer(multipartFile, deps.maxFileSize);
  const { zip, manifest } = await loadAlpArchive(buffer);

  const pluginId =
    typeof manifest.id === 'string'
      ? manifest.id
      : typeof manifest.pluginId === 'string'
        ? manifest.pluginId
        : 'unknown';
  const version =
    typeof manifest.version === 'string' ? manifest.version : '0.0.0';

  const signature = getNonEmptyString(manifest.signature);
  const manifestContentHash = getNonEmptyString(manifest.contentHash);
  const developerKeyFingerprint = getNonEmptyString(
    manifest.developerKeyFingerprint,
  );

  if (!signature || !manifestContentHash || !developerKeyFingerprint) {
    throw new PluginSignatureMissingException(pluginId);
  }

  const developerKey =
    await deps.developerKeyService.findActiveKeyByFingerprint(
      deps.orgId,
      developerKeyFingerprint,
    );

  if (!developerKey) {
    throw new PluginSignatureInvalidException(pluginId);
  }

  if (developerKey.userId !== deps.userId) {
    throw new PluginSignerMismatchException(pluginId);
  }

  const verificationResult = await deps.signatureService.verifyArchiveSignature(
    buffer,
    signature,
    developerKey.publicKey,
    pluginId,
  );

  if (verificationResult.contentHash !== manifestContentHash) {
    throw new PluginSignatureInvalidException(pluginId);
  }

  return {
    fields: multipartFile.fields,
    buffer,
    zip,
    manifest,
    pluginId,
    version,
    signature,
    contentHash: verificationResult.contentHash,
  };
}

/** 读取 multipart 表单中某个字段的字符串值；缺失或非字符串返回 undefined。 */
export function extractMultipartFieldValue(
  fields: MultipartFile['fields'] | undefined,
  fieldName: string,
): string | undefined {
  const rawValue = fields?.[fieldName];
  const entry = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (entry && 'value' in entry) {
    return typeof entry.value === 'string' ? entry.value : undefined;
  }

  return undefined;
}

async function readMultipartFile(
  request: FastifyRequest,
): Promise<MultipartFile> {
  try {
    const multipartFile = await request.file();

    if (!multipartFile) {
      throw new PluginValidationException('缺少插件文件');
    }

    return multipartFile;
  } catch (error) {
    rethrowMultipartLimitError(error);
    throw error;
  }
}

async function readMultipartBuffer(
  multipartFile: MultipartFile,
  maxFileSize: number,
): Promise<Buffer> {
  try {
    const buffer = await multipartFile.toBuffer();

    if (buffer.length > maxFileSize || multipartFile.file.truncated) {
      throw new PluginFileTooLargeException();
    }

    return buffer;
  } catch (error) {
    rethrowMultipartLimitError(error);
    throw error;
  }
}

function rethrowMultipartLimitError(error: unknown): void {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'FST_REQ_FILE_TOO_LARGE'
  ) {
    throw new PluginFileTooLargeException();
  }
}

async function loadAlpArchive(buffer: Buffer): Promise<{
  zip: JSZip;
  manifest: Record<string, unknown>;
}> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const manifestFile = zip.file('manifest.json');

    if (!manifestFile) {
      throw new PluginValidationException('插件包缺少 manifest.json');
    }

    const manifest = parseArchiveJson(
      await manifestFile.async('string'),
      'manifest.json',
    );

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new PluginValidationException('manifest.json 必须是 JSON 对象');
    }

    return { zip, manifest: manifest as Record<string, unknown> };
  } catch (error) {
    if (error instanceof PluginValidationException) {
      throw error;
    }

    throw new PluginValidationException('插件包解析失败');
  }
}

/** 解析归档内 JSON 文件，非法 JSON 转为插件校验异常。 */
export function parseArchiveJson(raw: string, sourceLabel: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new PluginValidationException(`${sourceLabel} 不是合法 JSON`);
  }
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
