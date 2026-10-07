/**
 * runtime 插件条目的激活审计。dsh 只把全局必需条目（agent-loop 等）的失败视为启动
 * 失败，其余条目未激活时只在 stderr 打一条警告，会话照常创建、插件静默缺席；
 * bridge 用这里的结果让会话创建失败并给出可读原因。
 */

/** cordis FiberState（const enum，运行时只有数值） */
const FIBER_PENDING = 0;
const FIBER_ACTIVE = 2;
const FIBER_FAILED = 3;

/** cordis-plugin-loader Entry 中审计读取的结构子集 */
export interface LoaderEntryLike {
  options: { id: string; name: string };
  readonly disabled: boolean;
  fiber?: {
    state: number;
    inject: Record<string, unknown>;
    ctx: { get(name: string): unknown };
    await(): Promise<unknown>;
  };
  parent: { tree: { import(name: string, getOuterStack: () => string[]): Promise<unknown> } };
}

export interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>;
}

export interface InactiveEntry {
  id: string;
  /** 条目的 name（模块路径或包名） */
  module: string;
  reason: string;
}

/**
 * 按 dsh-app-boot 启动审计的同一套判据找出给定 id 中未激活的条目（禁用的条目不算）。
 * 导入失败时 Loader 不保留错误（只写日志），这里重放一次导入取回原始错误，
 * 例如缺失的依赖包名。
 */
export async function findInactiveEntries(
  loader: LoaderLike,
  ids: readonly string[],
): Promise<InactiveEntry[]> {
  const wanted = new Set(ids);
  const inactive: InactiveEntry[] = [];
  for (const entry of loader.entries()) {
    const { id, name: module } = entry.options;
    if (!wanted.has(id)) continue;
    let disabled: boolean;
    try {
      disabled = entry.disabled;
    } catch (error) {
      inactive.push({ id, module, reason: `disabled 表达式求值失败: ${errorText(error)}` });
      continue;
    }
    if (disabled) continue;

    const fiber = entry.fiber;
    if (fiber === undefined) {
      const reason = await entry.parent.tree.import(module, () => []).then(
        () => '模块导入失败',
        (error: unknown) => `模块导入失败: ${errorText(error)}`,
      );
      inactive.push({ id, module, reason });
    } else if (fiber.state === FIBER_FAILED) {
      const reason = await fiber.await().then(
        () => '插件激活失败',
        (error: unknown) => `插件激活失败: ${errorText(error)}`,
      );
      inactive.push({ id, module, reason });
    } else if (fiber.state === FIBER_PENDING) {
      const missing = Object.keys(fiber.inject).filter(
        (service) => fiber.ctx.get(service) === undefined,
      );
      inactive.push({
        id,
        module,
        reason: `等待服务 ${missing.join(', ') || '（未知）'}，这些服务在当前 profile 中不存在或未激活`,
      });
    } else if (fiber.state !== FIBER_ACTIVE) {
      inactive.push({ id, module, reason: `fiber 状态 ${fiber.state}` });
    }
  }
  return inactive;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
