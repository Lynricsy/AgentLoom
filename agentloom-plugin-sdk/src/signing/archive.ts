import { createHash, createPublicKey } from 'node:crypto';

import JSZip from 'jszip';

const SIGNING_METADATA_KEYS = new Set([
  'signature',
  'contentHash',
  'developerKeyFingerprint',
]);

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface ArchiveEntry {
  path: string;
  contents: Buffer;
}

interface CanonicalArchiveFileEntry {
  path: string;
  sha256: string;
}

interface CanonicalArchiveDescriptor {
  manifest: JsonValue;
  files: CanonicalArchiveFileEntry[];
}

export async function readArchiveManifest<T extends Record<string, unknown> = Record<string, unknown>>(
  archiveData: Buffer | Uint8Array,
): Promise<T> {
  const entries = await loadArchiveEntries(archiveData);
  const manifestEntry = entries.get('manifest.json');

  if (!manifestEntry) {
    throw new Error('插件包缺少 manifest.json');
  }

  return parseArchiveManifest(manifestEntry.contents) as T;
}

export async function updateArchiveManifest(
  archiveData: Buffer | Uint8Array,
  manifest: Record<string, unknown>,
): Promise<Buffer> {
  const archive = await JSZip.loadAsync(toBuffer(archiveData));
  archive.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

export async function createCanonicalArchivePayload(
  archiveData: Buffer | Uint8Array,
): Promise<Buffer> {
  const entries = await loadArchiveEntries(archiveData);
  const manifestEntry = entries.get('manifest.json');

  if (!manifestEntry) {
    throw new Error('插件包缺少 manifest.json');
  }

  const manifest = sortJsonValue(stripSigningMetadata(parseArchiveManifest(manifestEntry.contents)));
  const files = [...entries.values()]
    .filter((entry) => entry.path !== 'manifest.json')
    .map<CanonicalArchiveFileEntry>((entry) => ({
      path: entry.path,
      sha256: computeSha256Hex(entry.contents),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const descriptor: CanonicalArchiveDescriptor = {
    manifest,
    files,
  };

  return Buffer.from(JSON.stringify(descriptor), 'utf8');
}

export function computeSha256Hex(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(toBuffer(data)).digest('hex');
}

export function computeKeyFingerprint(publicKeyPem: string): string {
  const publicKey = createPublicKey(publicKeyPem);
  const der = publicKey.export({ type: 'spki', format: 'der' });

  return createHash('sha256').update(der).digest('hex');
}

async function loadArchiveEntries(
  archiveData: Buffer | Uint8Array,
): Promise<Map<string, ArchiveEntry>> {
  const archive = await JSZip.loadAsync(toBuffer(archiveData));
  const entries = new Map<string, ArchiveEntry>();

  await Promise.all(
    Object.values(archive.files)
      .filter((entry) => !entry.dir)
      .map(async (entry) => {
        const path = normalizeArchivePath(entry.name);

        if (entries.has(path)) {
          throw new Error(`插件包包含重复的归档路径: ${path}`);
        }

        const contents = await entry.async('nodebuffer');
        entries.set(path, { path, contents });
      }),
  );

  return entries;
}

function normalizeArchivePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    throw new Error('插件包包含空归档路径');
  }

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`插件包包含非法归档路径: ${path}`);
  }

  return segments.join('/');
}

function parseArchiveManifest(buffer: Buffer): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('插件包中的 manifest.json 不是合法 JSON');
  }

  if (!isRecord(parsed)) {
    throw new Error('插件包中的 manifest.json 必须是 JSON 对象');
  }

  return parsed;
}

function stripSigningMetadata(manifest: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !SIGNING_METADATA_KEYS.has(key)),
  );
}

function sortJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, JsonValue>>((result, key) => {
        result[key] = sortJsonValue(value[key]);
        return result;
      }, {});
  }

  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toBuffer(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
