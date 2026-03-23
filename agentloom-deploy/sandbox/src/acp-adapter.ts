import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type {
  IAgentSession,
  SessionEntry,
  CreateSessionRequest,
  CreateSessionResponse,
  AbortResponse,
} from './types.js';

export interface SandboxConfig {
  systemPrompt?: string;
  model?: string;
  settings?: Record<string, unknown>;
  models?: Record<string, unknown>;
}

const CONFIG_PATHS = {
  settings: '/config/settings.json',
  models: '/config/models.json',
  systemPrompt: '/config/system-prompt.md',
} as const;

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return null;
  }
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export async function loadSandboxConfig(): Promise<SandboxConfig> {
  const [settings, models, systemPrompt] = await Promise.all([
    readJsonFile(CONFIG_PATHS.settings),
    readJsonFile(CONFIG_PATHS.models),
    readTextFile(CONFIG_PATHS.systemPrompt),
  ]);
  return {
    settings: settings ?? undefined,
    models: models ?? undefined,
    systemPrompt: systemPrompt ?? undefined,
    model: (settings as Record<string, string> | null)?.model ?? process.env['SANDBOX_MODEL'],
  };
}

export type SessionFactory = (
  cwd: string,
  config: SandboxConfig,
) => Promise<IAgentSession>;

export class AcpAdapter {
  private sessions = new Map<string, SessionEntry>();
  private config: SandboxConfig | null = null;

  constructor(private readonly createSession: SessionFactory) {}

  async init(): Promise<void> {
    this.config = await loadSandboxConfig();
  }

  async createNewSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
    const cwd = req.cwd ?? '/workspace';
    const session = await this.createSession(cwd, this.config ?? {});
    const id = randomUUID();

    this.sessions.set(id, {
      id,
      session,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      isStreaming: false,
    });

    return { sessionId: id };
  }

  getSession(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  markStreaming(sessionId: string, streaming: boolean, permissionCallbackUrl?: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.isStreaming = streaming;
      entry.lastActiveAt = new Date();
      if (permissionCallbackUrl !== undefined) {
        entry.permissionCallbackUrl = permissionCallbackUrl;
      }
    }
  }

  async abort(sessionId: string): Promise<AbortResponse> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    await entry.session.abort();
    entry.isStreaming = false;
    entry.lastActiveAt = new Date();
    return { success: true };
  }

  disposeSession(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.session.dispose();
      this.sessions.delete(sessionId);
    }
  }

  disposeAll(): void {
    for (const entry of this.sessions.values()) {
      entry.session.dispose();
    }
    this.sessions.clear();
  }
}
