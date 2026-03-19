import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type {
  AcpClientCapabilities,
  AcpConnectionState,
  AcpInitializeResult,
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

    return {
      protocolVersion,
      serverInfo: {
        name: 'agentloom',
        version: this.serverVersion,
        capabilities: {
          loadSession: true,
          streaming: true,
          tools: true,
        },
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

    if (typeof value.read !== 'boolean' || typeof value.write !== 'boolean') {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      read: value.read,
      write: value.write,
    };
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
