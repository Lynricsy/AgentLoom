/**
 * 插件执行时使用的日志接口。
 */
export interface PluginLogger {
  /** 记录调试日志。 */
  debug(message: string, ...args: unknown[]): void;
  /** 记录信息日志。 */
  info(message: string, ...args: unknown[]): void;
  /** 记录告警日志。 */
  warn(message: string, ...args: unknown[]): void;
  /** 记录错误日志。 */
  error(message: string, ...args: unknown[]): void;
}

/**
 * 节点执行时可访问的上下文对象。
 */
export interface NodeExecutionContext {
  /** 输入端口值。 */
  inputs: Record<string, unknown>;
  /** 节点配置值。 */
  config: Record<string, unknown>;
  /** 平台注入的日志器。 */
  logger: PluginLogger;
  /** 当前执行步骤的元数据。 */
  metadata: {
    /** 工作流执行 ID。 */
    executionId: string;
    /** 当前步骤 ID。 */
    stepId: string;
    /** 当前节点 ID。 */
    nodeId: string;
  };
}

/**
 * 节点执行结果。
 */
export interface NodeExecutionResult {
  /** 输出端口值。 */
  outputs: Record<string, unknown>;
  /** 额外执行元数据。 */
  metadata?: Record<string, unknown>;
}
