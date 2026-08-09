import { mkdirSync, openSync, closeSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve, sep } from 'node:path';
import type { CreateSessionRequest } from './types.js';

const DEFAULT_SESSION_ROOT = '/run/agentloom/sessions';
const MAX_CONFIG_FILE_BYTES = 1024 * 1024;
const MAX_CONFIG_TOTAL_BYTES = 16 * 1024 * 1024;
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export interface PreparedSessionConfig {
  directory: string;
  modelsPath: string;
  dispose(): void;
}

function validateRelativeConfigPath(rawPath: string): string {
  if (rawPath.length === 0 || rawPath.includes('\\') || posix.isAbsolute(rawPath)) {
    throw new Error(`Invalid session config path: ${rawPath}`);
  }
  const normalized = posix.normalize(rawPath);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized !== rawPath
  ) {
    throw new Error(`Invalid session config path: ${rawPath}`);
  }
  return normalized;
}

function serializeConfigFiles(request: CreateSessionRequest): Map<string, string> {
  const files = new Map<string, string>();
  const add = (path: string, content: string) => {
    const normalized = validateRelativeConfigPath(path);
    if (files.has(normalized)) {
      throw new Error(`Duplicate session config path: ${normalized}`);
    }
    const size = Buffer.byteLength(content);
    if (size > MAX_CONFIG_FILE_BYTES) {
      throw new Error(`Session config file exceeds 1 MiB: ${normalized}`);
    }
    files.set(normalized, content);
  };

  add('settings.json', JSON.stringify(request.settings ?? {}));
  add('models.json', JSON.stringify(request.models ?? { providers: {} }));
  add('system-prompt.md', request.systemPrompt ?? '');
  add('mcp-servers.json', JSON.stringify(request.mcpServers ?? {}));
  for (const [path, content] of Object.entries(request.files ?? {})) {
    if (typeof content !== 'string') {
      throw new Error(`Session config file must be text: ${path}`);
    }
    add(path, content);
  }

  const totalBytes = Array.from(files.values()).reduce(
    (sum, content) => sum + Buffer.byteLength(content),
    0,
  );
  if (totalBytes > MAX_CONFIG_TOTAL_BYTES) {
    throw new Error('Session config payload exceeds 16 MiB');
  }
  return files;
}

export function prepareSessionConfig(
  request: CreateSessionRequest,
  root = process.env['SANDBOX_SESSION_ROOT'] ?? DEFAULT_SESSION_ROOT,
): PreparedSessionConfig {
  const sessionId = request.sessionId?.trim();
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('A valid sessionId is required for session-scoped config');
  }

  const rootPath = resolve(root);
  const sessionDirectory = resolve(rootPath, sessionId);
  if (!sessionDirectory.startsWith(`${rootPath}${sep}`)) {
    throw new Error('Session config directory escapes configured root');
  }

  const files = serializeConfigFiles(request);
  mkdirSync(rootPath, { recursive: true, mode: 0o700 });
  mkdirSync(sessionDirectory, { recursive: false, mode: 0o700 });

  try {
    for (const [relativePath, content] of files) {
      const targetPath = join(sessionDirectory, relativePath);
      mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
      const descriptor = openSync(targetPath, 'wx', 0o600);
      try {
        writeFileSync(descriptor, content, { encoding: 'utf8' });
      } finally {
        closeSync(descriptor);
      }
    }
  } catch (error) {
    rmSync(sessionDirectory, { recursive: true, force: true });
    throw error;
  }

  return {
    directory: sessionDirectory,
    modelsPath: join(sessionDirectory, 'models.json'),
    dispose: () => rmSync(sessionDirectory, { recursive: true, force: true }),
  };
}
