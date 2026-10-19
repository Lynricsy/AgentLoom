import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';

/**
 * 记忆模块所有「资源不存在」异常的基类。
 * 调用方需要把不存在当作可恢复分支（例如 browse 虚拟节点、boot 协议跳过缺失路径）时，
 * 用 `instanceof MemoryResourceNotFoundException` 判断，而不是依赖具体子类。
 */
export abstract class MemoryResourceNotFoundException extends DomainException {}

export class MemoryInstanceNotFoundException extends MemoryResourceNotFoundException {
  constructor(instanceId: string) {
    super({
      type: problemType('memory-instance-not-found'),
      title: '记忆实例不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${instanceId} 的记忆实例`,
    });
  }
}

export class MemoryNodeNotFoundException extends MemoryResourceNotFoundException {
  constructor(nodeId: string, instanceId?: string) {
    super({
      type: problemType('memory-node-not-found'),
      title: '记忆节点不存在',
      status: HttpStatus.NOT_FOUND,
      detail: instanceId
        ? `记忆实例 ${instanceId} 中未找到 ID 为 ${nodeId} 的节点`
        : `未找到 ID 为 ${nodeId} 的记忆节点`,
    });
  }
}

export class MemoryEdgeNotFoundException extends MemoryResourceNotFoundException {
  constructor(edgeId: string) {
    super({
      type: problemType('memory-edge-not-found'),
      title: '记忆边不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${edgeId} 的记忆边`,
    });
  }
}

export class MemoryPathNotFoundException extends MemoryResourceNotFoundException {
  constructor(pathRef: string) {
    super({
      type: problemType('memory-path-not-found'),
      title: '记忆路径不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到记忆路径 ${pathRef}`,
    });
  }
}

/** 版本不存在，或不属于路由中的节点（不区分两者，避免泄露其他节点的版本 ID）。 */
export class MemoryVersionNotFoundException extends MemoryResourceNotFoundException {
  constructor(nodeId: string, versionId?: string) {
    super({
      type: problemType('memory-version-not-found'),
      title: '记忆版本不存在',
      status: HttpStatus.NOT_FOUND,
      detail: versionId
        ? `节点 ${nodeId} 下未找到 ID 为 ${versionId} 的版本`
        : `节点 ${nodeId} 尚无有效版本`,
    });
  }
}

export class MemoryGlossaryKeywordConflictException extends DomainException {
  constructor(keyword: string, nodeId: string) {
    super({
      type: problemType('memory-glossary-keyword-conflict'),
      title: '术语关键词已存在',
      status: HttpStatus.CONFLICT,
      detail: `关键词「${keyword}」已绑定到节点 ${nodeId}`,
    });
  }
}

export class MemoryEdgeConflictException extends DomainException {
  constructor() {
    super({
      type: problemType('memory-edge-conflict'),
      title: '记忆边已存在',
      status: HttpStatus.CONFLICT,
      detail: '这两个节点之间已存在同名记忆边',
    });
  }
}

export class MemoryEdgeCycleException extends DomainException {
  constructor() {
    super({
      type: problemType('memory-edge-cycle'),
      title: '记忆边会形成环',
      status: HttpStatus.CONFLICT,
      detail: '创建这条边会在记忆图中形成环',
    });
  }
}

export class MemoryPathConflictException extends DomainException {
  constructor(uri: string) {
    super({
      type: problemType('memory-path-conflict'),
      title: '记忆路径已存在',
      status: HttpStatus.CONFLICT,
      detail: `记忆路径 ${uri} 已存在`,
    });
  }
}

export class MemoryVersionChainExistsException extends DomainException {
  constructor(nodeId: string) {
    super({
      type: problemType('memory-version-chain-exists'),
      title: '节点已有版本链',
      status: HttpStatus.CONFLICT,
      detail: `节点 ${nodeId} 已有版本，请改用 patch 或 append 模式`,
    });
  }
}

export class MemoryPatchTargetNotFoundException extends DomainException {
  constructor() {
    super({
      type: problemType('memory-patch-target-not-found'),
      title: '补丁原文不存在',
      status: HttpStatus.CONFLICT,
      detail: '当前版本内容中找不到 oldString，无法应用补丁',
    });
  }
}

export class MemoryVersionConcurrentUpdateException extends DomainException {
  constructor() {
    super({
      type: problemType('memory-version-concurrent-update'),
      title: '记忆版本已被并发修改',
      status: HttpStatus.CONFLICT,
      detail: '最新版本在本次更新期间已变化，请刷新后重试',
    });
  }
}

export class MemoryUriInvalidException extends DomainException {
  constructor(uri: string, reason = 'URI 格式应为 domain://path/segment') {
    super({
      type: problemType('memory-uri-invalid'),
      title: '记忆 URI 不合法',
      status: HttpStatus.BAD_REQUEST,
      detail: `记忆 URI「${uri}」不合法：${reason}`,
    });
  }
}

/** 路径或边引用的节点不属于目标实例。 */
export class MemoryCrossInstanceException extends DomainException {
  constructor(resource: 'edge' | 'path') {
    super({
      type: problemType('memory-cross-instance'),
      title: '不能跨记忆实例关联',
      status: HttpStatus.BAD_REQUEST,
      detail:
        resource === 'edge'
          ? '记忆边的父子节点必须属于同一个记忆实例'
          : '记忆路径指向的节点必须属于该记忆实例',
    });
  }
}
