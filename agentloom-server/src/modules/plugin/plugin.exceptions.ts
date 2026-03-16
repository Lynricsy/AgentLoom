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
  constructor(message: string) {
    super({
      type: `${BASE_URL}/plugin-validation-failed`,
      title: '插件校验失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: message,
      errors: [
        {
          field: 'plugin',
          message,
        },
      ],
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
