import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServerConfig } from './types.js';

/**
 * 预装在 guest 镜像里的 stdio MCP server 二进制：写 dsh-mcp-client 配置前把
 * `npx -y <pkg>` 改写为本地二进制，避免会话启动时经 npx 在线下载。
 */
const BUNDLED_STDIO_BINARIES = {
  'grok-search': join(process.cwd(), 'node_modules', '.bin', 'grok-search'),
} as const;

export function normalizeBundledMcpServerConfig(
  config: McpServerConfig,
): McpServerConfig {
  if (config.transportType !== 'stdio') {
    return config;
  }

  const invocation = parseNpxPackageInvocation(config.command, config.args);
  if (!invocation) {
    return config;
  }

  const binaryPath =
    BUNDLED_STDIO_BINARIES[
      invocation.packageName as keyof typeof BUNDLED_STDIO_BINARIES
    ];
  if (!binaryPath || !existsSync(binaryPath)) {
    return config;
  }

  return {
    ...config,
    command: binaryPath,
    args: invocation.forwardedArgs,
  };
}

function parseNpxPackageInvocation(
  command?: string,
  args?: string[],
): { packageName: string; forwardedArgs: string[] } | null {
  if (command !== 'npx') {
    return null;
  }

  const tokens = [...(args ?? [])];
  const forwardedArgs: string[] = [];
  let packageSpec: string | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--') {
      forwardedArgs.push(...tokens.slice(index + 1));
      break;
    }

    if (packageSpec === null && (token === '-y' || token === '--yes')) {
      continue;
    }

    if (packageSpec === null && (token === '-p' || token === '--package')) {
      const nextToken = tokens[index + 1];
      if (!nextToken) {
        return null;
      }
      packageSpec = nextToken;
      index += 1;
      continue;
    }

    if (packageSpec === null) {
      packageSpec = token;
      continue;
    }

    forwardedArgs.push(token);
  }

  if (packageSpec === null) {
    return null;
  }

  return {
    packageName: stripPackageVersion(packageSpec),
    forwardedArgs,
  };
}

function stripPackageVersion(packageSpec: string): string {
  if (!packageSpec.startsWith('@')) {
    const versionMarkerIndex = packageSpec.lastIndexOf('@');
    return versionMarkerIndex > 0
      ? packageSpec.slice(0, versionMarkerIndex)
      : packageSpec;
  }

  const scopeSeparatorIndex = packageSpec.indexOf('/');
  const versionMarkerIndex = packageSpec.lastIndexOf('@');
  return versionMarkerIndex > scopeSeparatorIndex
    ? packageSpec.slice(0, versionMarkerIndex)
    : packageSpec;
}
