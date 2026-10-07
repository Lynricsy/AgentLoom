import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';
import { RUNTIME_PLUGIN_SUPPORTED_DSH_VERSION } from './runtime-plugin.constants';

export class RuntimePluginNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: problemType('runtime-plugin-not-found'),
      title: 'Runtime 插件不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Runtime 插件 ${id} 不存在`,
    });
  }
}

export class RuntimePluginAlreadyExistsException extends DomainException {
  constructor(pluginId: string, version: string) {
    super({
      type: problemType('runtime-plugin-already-exists'),
      title: 'Runtime 插件已存在',
      status: HttpStatus.CONFLICT,
      detail: `Runtime 插件 ${pluginId}@${version} 已在当前组织中注册`,
    });
  }
}

export class RuntimePluginValidationException extends DomainException {
  constructor(message: string | string[]) {
    const messages = Array.isArray(message) ? message : [message];

    super({
      type: problemType('runtime-plugin-validation-failed'),
      title: 'Runtime 插件校验失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: messages.join('\n'),
      errors: messages.map((entry) => ({
        field: entry.includes(':')
          ? entry.split(':', 1)[0]?.trim() || 'runtimePlugin'
          : 'runtimePlugin',
        message: entry,
      })),
    });
  }
}

export class RuntimePluginUnsupportedDshVersionException extends DomainException {
  constructor(dshVersion: string) {
    super({
      type: problemType('runtime-plugin-unsupported-dsh-version'),
      title: 'Runtime 插件 dsh 版本不受支持',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `插件声明 dshVersion ${dshVersion}，当前平台只支持 ${RUNTIME_PLUGIN_SUPPORTED_DSH_VERSION}`,
    });
  }
}

export class RuntimePluginInactiveException extends DomainException {
  constructor(id: string) {
    super({
      type: problemType('runtime-plugin-inactive'),
      title: 'Runtime 插件未启用',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `Runtime 插件 ${id} 当前未处于启用状态`,
    });
  }
}

export class RuntimePluginVersionConflictException extends DomainException {
  constructor(id: string, currentVersion: number) {
    super({
      type: problemType('runtime-plugin-version-conflict'),
      title: 'Runtime 插件版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `Runtime 插件 ${id} 已被其他用户修改，请刷新后重试`,
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
