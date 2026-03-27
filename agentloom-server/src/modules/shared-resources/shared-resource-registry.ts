import { Injectable, Logger } from '@nestjs/common';

/**
 * 共享资源提供者接口 — 管理特定类型共享资源的完整生命周期。
 *
 * @template TConfig 创建资源所需的配置类型
 * @template TInstance 资源实例标识/句柄类型
 */
export interface SharedResourceProvider<
  TConfig = unknown,
  TInstance = unknown,
> {
  /** 此提供者管理的资源类型标识（如 'sandbox', 'memory' 等） */
  readonly type: string;

  /** 根据配置创建资源实例 */
  create(config: TConfig): Promise<TInstance>;

  /** 销毁指定资源实例 */
  destroy(instance: TInstance): Promise<void>;

  /** 将资源实例共享给消费者（如 agent/step） */
  share(instance: TInstance, consumerId: string): Promise<void>;
}

/**
 * 共享资源注册表 — 可扩展的资源类型注册与统一生命周期管理。
 *
 * 注册表持有已注册的 provider 映射表，并提供统一的
 * createResource / shareResource 入口。各 provider 自行实现具体逻辑。
 */
@Injectable()
export class SharedResourceRegistry {
  private readonly logger = new Logger(SharedResourceRegistry.name);
  private readonly providers = new Map<
    string,
    SharedResourceProvider<unknown, unknown>
  >();

  /**
   * 注册资源提供者。
   * @throws 当同一类型已注册时抛出错误（不静默覆盖）
   */
  register(provider: SharedResourceProvider): void {
    if (this.providers.has(provider.type)) {
      throw new Error(
        `SharedResourceProvider for type "${provider.type}" is already registered`,
      );
    }

    this.providers.set(provider.type, provider);
    this.logger.log(`Registered shared resource provider: ${provider.type}`);
  }

  /**
   * 获取已注册的提供者。
   * @returns 提供者实例，未注册时返回 undefined
   */
  getProvider<TConfig = unknown, TInstance = unknown>(
    type: string,
  ): SharedResourceProvider<TConfig, TInstance> | undefined {
    return this.providers.get(type) as
      | SharedResourceProvider<TConfig, TInstance>
      | undefined;
  }

  /**
   * 通过指定类型的提供者创建资源实例。
   * @throws 当类型未注册时抛出错误
   */
  async createResource<TConfig = unknown, TInstance = unknown>(
    type: string,
    config: TConfig,
  ): Promise<TInstance> {
    const provider = this.getProvider<TConfig, TInstance>(type);
    if (!provider) {
      throw new Error(
        `No SharedResourceProvider registered for type "${type}"`,
      );
    }

    this.logger.debug(`Creating shared resource of type "${type}"`);
    return provider.create(config);
  }

  /**
   * 将已有资源实例共享给消费者。
   * @throws 当类型未注册时抛出错误
   */
  async shareResource<TInstance = unknown>(
    type: string,
    instance: TInstance,
    consumerId: string,
  ): Promise<void> {
    const provider = this.getProvider<unknown, TInstance>(type);
    if (!provider) {
      throw new Error(
        `No SharedResourceProvider registered for type "${type}"`,
      );
    }

    this.logger.debug(
      `Sharing resource of type "${type}" with consumer ${consumerId}`,
    );
    return provider.share(instance, consumerId);
  }
}
