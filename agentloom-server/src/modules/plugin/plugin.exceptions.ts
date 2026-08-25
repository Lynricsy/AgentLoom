import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

const BASE_URL = 'https://agentloom.dev/errors';

export class PluginNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: `${BASE_URL}/plugin-not-found`,
      title: '插件不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `插件 ${id} 不存在`,
    });
  }
}

export class PluginAlreadyExistsException extends DomainException {
  constructor(pluginId: string) {
    super({
      type: `${BASE_URL}/plugin-already-exists`,
      title: '插件已存在',
      status: HttpStatus.CONFLICT,
      detail: `插件 ${pluginId} 已在当前组织中注册`,
    });
  }
}

export class PluginVersionConflictException extends DomainException {
  constructor(id: string, currentVersion: number) {
    super({
      type: `${BASE_URL}/plugin-version-conflict`,
      title: '插件版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `插件 ${id} 已被其他用户修改，请刷新后重试`,
      extensions: {
        currentVersion,
      },
      errors: [
        {
          field: 'occVersion',
          message: `当前版本为 ${currentVersion}`,
        },
      ],
    });
  }
}

export class PluginInactiveException extends DomainException {
  constructor(id: string) {
    super({
      type: `${BASE_URL}/plugin-inactive`,
      title: '插件不可用',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `插件 ${id} 当前未处于激活状态`,
    });
  }
}

export class PluginValidationException extends DomainException {
  constructor(message: string | string[]) {
    const messages = Array.isArray(message) ? message : [message];

    super({
      type: `${BASE_URL}/plugin-validation-failed`,
      title: '插件校验失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: messages.join('\n'),
      errors: messages.map((entry) => ({
        field: entry.includes(':')
          ? entry.split(':', 1)[0]?.trim() || 'plugin'
          : 'plugin',
        message: entry,
      })),
    });
  }
}

export class PluginFileTooLargeException extends DomainException {
  constructor() {
    super({
      type: `${BASE_URL}/plugin-file-too-large`,
      title: '插件文件过大',
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      detail: '插件文件大小不能超过 50MB',
    });
  }
}

export class PluginSignatureMissingException extends DomainException {
  constructor(pluginId: string) {
    super({
      type: `${BASE_URL}/plugin-signature-missing`,
      title: 'Plugin Signature Missing',
      status: HttpStatus.BAD_REQUEST,
      detail: `插件 "${pluginId}" 缺少签名信息。所有插件必须进行代码签名。`,
    });
  }
}

export class PluginSignatureInvalidException extends DomainException {
  constructor(pluginId: string) {
    super({
      type: `${BASE_URL}/plugin-signature-invalid`,
      title: 'Plugin Signature Invalid',
      status: HttpStatus.UNAUTHORIZED,
      detail: `插件 "${pluginId}" 的签名验证失败。归档可能已被篡改或使用了错误的签名密钥。`,
    });
  }
}

export class PluginDeveloperKeyInvalidException extends DomainException {
  constructor(detail?: string) {
    super({
      type: `${BASE_URL}/plugin-developer-key-invalid`,
      title: 'Plugin Developer Key Invalid',
      status: HttpStatus.BAD_REQUEST,
      detail:
        detail ??
        '提供的开发者公钥无效。需要 RSA-2048 位或更长的 PEM 格式公钥。',
    });
  }
}

export class PluginDeveloperKeyNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: `${BASE_URL}/plugin-developer-key-not-found`,
      title: 'Plugin Developer Key Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `开发者密钥 ${id} 不存在或不属于当前组织`,
    });
  }
}

export class PluginExecutionTimeoutException extends DomainException {
  constructor(pluginId: string, timeoutMs: number) {
    super({
      type: `${BASE_URL}/plugin-execution-timeout`,
      title: 'Plugin Execution Timeout',
      status: HttpStatus.GATEWAY_TIMEOUT,
      detail: `插件 "${pluginId}" 执行超时 (${timeoutMs}ms)。请检查插件逻辑或增加超时配置。`,
    });
  }
}

export class PluginResourceExhaustedException extends DomainException {
  constructor(pluginId: string, resource: string) {
    super({
      type: `${BASE_URL}/plugin-resource-exhausted`,
      title: 'Plugin Resource Exhausted',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `插件 "${pluginId}" 超出 ${resource} 限制。请优化插件以减少资源消耗。`,
    });
  }
}

export class PluginPermissionDeniedException extends DomainException {
  constructor(pluginId: string, detail?: string) {
    super({
      type: `${BASE_URL}/plugin-permission-denied`,
      title: 'Plugin Permission Denied',
      status: HttpStatus.FORBIDDEN,
      detail: detail ?? `插件 "${pluginId}" 尝试访问未授权的资源。`,
    });
  }
}

export class PluginSandboxException extends DomainException {
  constructor(pluginId: string, detail?: string) {
    super({
      type: `${BASE_URL}/plugin-sandbox-error`,
      title: 'Plugin Sandbox Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: detail ?? `插件 "${pluginId}" 在沙箱中执行时发生错误。`,
    });
  }
}

export class PluginUsageLedgerException extends DomainException {
  constructor(pluginId: string, detail?: string) {
    super({
      type: `${BASE_URL}/plugin-usage-ledger-error`,
      title: 'Plugin Usage Ledger Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: detail ?? `插件 "${pluginId}" 的用量落账失败，执行结果已回滚。`,
    });
  }
}

export class PluginEarningsPayoutTransitionException extends DomainException {
  constructor(
    earningId: string,
    currentStatus: string,
    nextStatus: string,
    detail?: string,
  ) {
    super({
      type: `${BASE_URL}/plugin-earnings-payout-transition-invalid`,
      title: '插件收益打款状态迁移非法',
      status: HttpStatus.CONFLICT,
      detail:
        detail ??
        `收益记录 ${earningId} 无法从 ${currentStatus} 迁移到 ${nextStatus}`,
      extensions: {
        currentStatus,
        nextStatus,
      },
    });
  }
}
