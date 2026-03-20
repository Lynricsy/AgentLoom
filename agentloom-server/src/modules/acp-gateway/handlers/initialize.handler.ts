import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type {
  AcpClientCapabilities,
  AcpConnectionState,
  AcpInitializeResult,
  AcpServerCapabilities,
} from '../acp-types';

const SUPPORTED_PROTOCOL_VERSIONS = ['2026-02-18'] as const;

type PackageJsonShape = {
  version?: string;
};

function readServerVersion(): string {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as PackageJsonShape;

  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error('agentloom-server/package.json 缺少有效 version');
  }

  return packageJson.version;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class InitializeHandler {
  private readonly serverVersion = readServerVersion();

  async handle(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpInitializeResult> {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const protocolVersion = this.readProtocolVersion(params);
    const clientCapabilities = this.readClientCapabilities(params);

    state.initialized = true;
    state.clientCapabilities = clientCapabilities;
    state.negotiatedProtocolVersion = protocolVersion;

    const capabilities: AcpServerCapabilities = {
      loadSession: true,
      streaming: true,
      tools: true,
    };

    capabilities.fs = this.buildFilesystemCapability(state);

    const terminalCapability = this.buildTerminalCapability(clientCapabilities);
    if (terminalCapability) {
      capabilities.terminal = terminalCapability;
    }

    return {
      protocolVersion,
      serverInfo: {
        name: 'agentloom',
        version: this.serverVersion,
        capabilities,
      },
    };
  }

  private readProtocolVersion(params: Record<string, unknown>): string {
    const protocolVersion = params.protocolVersion;

    if (typeof protocolVersion !== 'string' || protocolVersion.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    if (!SUPPORTED_PROTOCOL_VERSIONS.some((version) => version === protocolVersion)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        requestedProtocolVersion: protocolVersion,
        supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      });
    }

    return protocolVersion;
  }

  private readClientCapabilities(
    params: Record<string, unknown>,
  ): AcpClientCapabilities {
    const clientCapabilities = params.clientCapabilities;

    if (!isPlainObject(clientCapabilities)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const normalizedCapabilities: AcpClientCapabilities = {};

    for (const [key, value] of Object.entries(clientCapabilities)) {
      normalizedCapabilities[key] = value;
    }

    if ('roots' in clientCapabilities) {
      normalizedCapabilities.roots = this.readRootsCapability(
        clientCapabilities.roots,
      );
    }

    if ('fs' in clientCapabilities) {
      normalizedCapabilities.fs = this.readFsCapability(clientCapabilities.fs);
    }

    if ('terminal' in clientCapabilities) {
      normalizedCapabilities.terminal = this.readTerminalCapability(
        clientCapabilities.terminal,
      );
    }

    if ('mcpServers' in clientCapabilities) {
      normalizedCapabilities.mcpServers = this.readMcpServersCapability(
        clientCapabilities.mcpServers,
      );
    }

    return normalizedCapabilities;
  }

  private buildFilesystemCapability(
    state: AcpConnectionState,
  ): AcpServerCapabilities['fs'] {
    return {
      readTextFile: true,
      writeTextFile: typeof state.requestClient === 'function',
    };
  }

  private buildTerminalCapability(
    clientCapabilities: AcpClientCapabilities,
  ): AcpServerCapabilities['terminal'] | undefined {
    if (
      !clientCapabilities.terminal ||
      !clientCapabilities.terminal.create ||
      !clientCapabilities.terminal.output
    ) {
      return undefined;
    }

    return {
      create: true,
    };
  }

  private readRootsCapability(value: unknown): AcpClientCapabilities['roots'] {
    if (!isPlainObject(value)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const normalizedRoots: NonNullable<AcpClientCapabilities['roots']> = {};

    for (const [key, entryValue] of Object.entries(value)) {
      normalizedRoots[key] = entryValue;
    }

    if (
      'listChanged' in value &&
      value.listChanged !== undefined &&
      typeof value.listChanged !== 'boolean'
    ) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return normalizedRoots;
  }

  private readFsCapability(value: unknown): NonNullable<AcpClientCapabilities['fs']> {
    if (!isPlainObject(value)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    if (
      typeof value.readTextFile === 'boolean' &&
      typeof value.writeTextFile === 'boolean'
    ) {
      return {
        readTextFile: value.readTextFile,
        writeTextFile: value.writeTextFile,
      };
    }

    if (typeof value.read === 'boolean' && typeof value.write === 'boolean') {
      return {
        readTextFile: value.read,
        writeTextFile: value.write,
      };
    }

    throw new AcpJsonRpcError(-32602, 'Invalid params');
  }

  private readTerminalCapability(
    value: unknown,
  ): NonNullable<AcpClientCapabilities['terminal']> {
    if (!isPlainObject(value)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    if (typeof value.create !== 'boolean' || typeof value.output !== 'boolean') {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      create: value.create,
      output: value.output,
    };
  }

  private readMcpServersCapability(value: unknown): true {
    if (value !== true) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return true;
  }
}
