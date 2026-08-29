import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { Agent, fetch as undiciFetch } from 'undici';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { SandboxRuntimeNode } from '../../database/schema';
import {
  SandboxConfigValidationException,
  SandboxNodeAdminForbiddenException,
  SandboxNodeConflictException,
  SandboxNodeNotFoundException,
  SandboxRuntimeNotFoundException,
} from './sandbox.exceptions';

/** Go runtime-manager `GET /v1/capacity` 的响应体。 */
export interface CapacitySnapshot {
  vmsUsed: number;
  vmsLimit: number;
  vcpuUsed: number;
  vcpuLimit: number;
  memoryMiBUsed: number;
  memoryMiBLimit: number;
  diskGiBUsed: number;
  diskGiBLimit: number;
}

export interface NodeProbeResult {
  healthy: boolean;
  capacity?: CapacitySnapshot;
}

/** 注册表意图 + manager 实况，供管理 API 列表直接呈现。 */
export interface SandboxRuntimeNodeStatus {
  node: SandboxRuntimeNode;
  healthy: boolean;
  capacity?: CapacitySnapshot;
}

export interface CreateSandboxNodeInput {
  id: string;
  baseUrl: string;
  serverName?: string | null;
  status?: 'active' | 'draining' | 'disabled';
}

export interface UpdateSandboxNodeInput {
  baseUrl?: string;
  serverName?: string | null;
  status?: 'active' | 'draining' | 'disabled';
}

const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CACHE_TTL_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;

/**
 * 分布式沙箱运行时节点注册表。
 *
 * `sandbox_runtime_nodes` 是平台级全局表（无 tenant_id、无 RLS），故所有查询
 * 直接走 `db`，不进 `runInTenantTransaction`。
 *
 * 同时持有 per-node mTLS dispatcher：节点身份与其 TLS 连接池天然同生命周期，
 * 放在一起可让 driver 无需自己缓存 Agent，也避免 driver↔registry 循环依赖。
 */
@Injectable()
export class SandboxRuntimeNodeRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SandboxRuntimeNodeRegistryService.name);
  private cache?: Map<string, SandboxRuntimeNode>;
  private cacheLoadedAt = 0;
  private readonly dispatchers = new Map<string, Agent>();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 首启引导：仅当注册表为空时，用 env 播种 `default` 节点。
   *
   * env 从此只是"首次启动种子"而非真相来源——表非空时绝不回写，否则 DB 与
   * env 会互相覆盖。server / worker 并发启动靠 ON CONFLICT 免竞态。
   */
  async onModuleInit(): Promise<void> {
    const existing = await this.db
      .select({ id: schema.sandboxRuntimeNodes.id })
      .from(schema.sandboxRuntimeNodes)
      .limit(1);
    if (existing.length > 0) return;

    const baseUrl = (
      process.env.APP_FIRECRACKER_RUNTIME_URL ??
      'https://firecracker-runtime:8443'
    )
      .trim()
      .replace(/\/+$/, '');
    const serverName = process.env.APP_FIRECRACKER_RUNTIME_SERVER_NAME || null;
    const inserted = await this.db
      .insert(schema.sandboxRuntimeNodes)
      .values({ id: 'default', baseUrl, serverName, status: 'active' })
      .onConflictDoNothing()
      .returning({ id: schema.sandboxRuntimeNodes.id });
    this.invalidate();
    if (inserted.length > 0) {
      this.logger.log(
        `Bootstrapped sandbox runtime node "default" at ${baseUrl}`,
      );
    }
  }

  /** 管理 API 用：始终读 DB，避免刚写完就读到旧缓存。 */
  async listNodes(): Promise<SandboxRuntimeNode[]> {
    return this.db
      .select()
      .from(schema.sandboxRuntimeNodes)
      .orderBy(schema.sandboxRuntimeNodes.id);
  }

  /** 管理 API 列表：逐节点并行探针，让运维直接看到实况而非注册表意图。 */
  async listNodeStatuses(): Promise<SandboxRuntimeNodeStatus[]> {
    const nodes = await this.listNodes();
    return Promise.all(
      nodes.map(async (node) => {
        const probe = await this.probeNode(node);
        return { node, healthy: probe.healthy, capacity: probe.capacity };
      }),
    );
  }

  /** 调度候选：仅 active。draining 保留存量 VM 但不再接新，disabled 完全下线。 */
  async listSchedulable(): Promise<SandboxRuntimeNode[]> {
    const nodes = await this.loadCache();
    return [...nodes.values()].filter((node) => node.status === 'active');
  }

  async getNode(nodeId: string): Promise<SandboxRuntimeNode | undefined> {
    const reusedSnapshot =
      this.cache !== undefined &&
      Date.now() - this.cacheLoadedAt < CACHE_TTL_MS;
    const cached = (await this.loadCache()).get(nodeId);
    if (cached || !reusedSnapshot) return cached;
    // 复用快照上没命中：可能是别的进程刚注册的节点，重查一次再判死。
    // 刚从 DB 加载过的快照没必要重查——结果必然相同。
    this.invalidate();
    return (await this.loadCache()).get(nodeId);
  }

  /** handle 路由用：解析不到节点即 fail-closed，绝不回退到"某个"节点。 */
  async getNodeOrThrow(nodeId: string): Promise<SandboxRuntimeNode> {
    const node = await this.getNode(nodeId);
    if (!node) throw new SandboxRuntimeNotFoundException();
    return node;
  }

  async createNode(input: CreateSandboxNodeInput): Promise<SandboxRuntimeNode> {
    if (!NODE_ID_PATTERN.test(input.id)) {
      throw new SandboxConfigValidationException(
        `node id "${input.id}" must match ${NODE_ID_PATTERN.source}`,
      );
    }
    const baseUrl = assertBaseUrl(input.baseUrl);
    const [node] = await this.db
      .insert(schema.sandboxRuntimeNodes)
      .values({
        id: input.id,
        baseUrl,
        serverName: input.serverName?.trim() || null,
        status: input.status ?? 'active',
      })
      .onConflictDoNothing()
      .returning();
    this.invalidate();
    if (!node) {
      throw new SandboxNodeConflictException(
        `Sandbox runtime node ${input.id} already exists`,
      );
    }
    return node;
  }

  async updateNode(
    nodeId: string,
    input: UpdateSandboxNodeInput,
  ): Promise<SandboxRuntimeNode> {
    const patch: Partial<typeof schema.sandboxRuntimeNodes.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.baseUrl !== undefined)
      patch.baseUrl = assertBaseUrl(input.baseUrl);
    if (input.serverName !== undefined) {
      patch.serverName = input.serverName?.trim() || null;
    }
    if (input.status !== undefined) patch.status = input.status;

    const [node] = await this.db
      .update(schema.sandboxRuntimeNodes)
      .set(patch)
      .where(eq(schema.sandboxRuntimeNodes.id, nodeId))
      .returning();
    this.invalidate();
    if (!node) throw new SandboxNodeNotFoundException(nodeId);
    return node;
  }

  async deleteNode(nodeId: string): Promise<void> {
    const deleted = await this.db
      .delete(schema.sandboxRuntimeNodes)
      .where(eq(schema.sandboxRuntimeNodes.id, nodeId))
      .returning({ id: schema.sandboxRuntimeNodes.id });
    this.invalidate();
    if (deleted.length === 0) throw new SandboxNodeNotFoundException(nodeId);
  }

  /**
   * 带前置条件的下线：必须先 disable（避免删到还在接新请求的节点），且节点上
   * 不能还有 microVM。
   *
   * 占用判定用 manager 实况而非扫 `sandbox_sessions`：后者受 RLS 约束，跨租户
   * 计数必然失真，会把"有别的租户 VM 在跑"误判成空节点。
   */
  async removeNode(nodeId: string, force: boolean): Promise<void> {
    const [node] = await this.db
      .select()
      .from(schema.sandboxRuntimeNodes)
      .where(eq(schema.sandboxRuntimeNodes.id, nodeId))
      .limit(1);
    if (!node) throw new SandboxNodeNotFoundException(nodeId);
    if (node.status !== 'disabled') {
      throw new SandboxNodeConflictException(
        `Sandbox runtime node ${nodeId} is ${node.status}; PATCH status to "disabled" before deleting it`,
      );
    }
    const probe = await this.probeNode(node);
    if (probe.healthy) {
      const vmsUsed = probe.capacity?.vmsUsed ?? 0;
      if (vmsUsed > 0) {
        throw new SandboxNodeConflictException(
          `Sandbox runtime node ${nodeId} still hosts ${vmsUsed} microVM(s); destroy them before deleting the node`,
        );
      }
    } else if (!force) {
      throw new SandboxNodeConflictException(
        `Sandbox runtime node ${nodeId} is unreachable, so its microVMs cannot be counted; retry with force=true to delete anyway`,
      );
    }
    await this.deleteNode(nodeId);
  }

  /**
   * 探测节点实时容量。任何失败（网络、超时、非 2xx、脏 JSON）都归为 unhealthy——
   * 调度宁可少一个候选，也不能把 VM 派给一台状态未知的机器。
   */
  async probeNode(node: SandboxRuntimeNode): Promise<NodeProbeResult> {
    try {
      const response = await undiciFetch(`${node.baseUrl}/v1/capacity`, {
        dispatcher: this.getDispatcher(node),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { healthy: false };
      }
      return {
        healthy: true,
        capacity: (await response.json()) as CapacitySnapshot,
      };
    } catch (error) {
      this.logger.debug(
        `Sandbox runtime node ${node.id} probe failed: ${String(error)}`,
      );
      return { healthy: false };
    }
  }

  /**
   * per-node mTLS dispatcher。所有节点共用同一套 client 证书（manager 只校验
   * 签发 CA，不校验 CN/SAN），差异只在 baseUrl 与 SNI。
   *
   * key 含 URL/SNI，故节点改址会自然产生新 Agent；旧 Agent 留在 Map 直到进程
   * 重启——数量级为节点数，不值得引入淘汰逻辑。
   */
  getDispatcher(node: SandboxRuntimeNode): Agent {
    const key = `${node.id}|${node.baseUrl}|${node.serverName ?? ''}`;
    const existing = this.dispatchers.get(key);
    if (existing) return existing;
    const dispatcher = new Agent({
      connect: {
        ca: readFileSync(
          process.env.APP_FIRECRACKER_RUNTIME_CA ??
            '/run/secrets/firecracker-client/ca.crt',
        ),
        cert: readFileSync(
          process.env.APP_FIRECRACKER_RUNTIME_CERT ??
            '/run/secrets/firecracker-client/tls.crt',
        ),
        key: readFileSync(
          process.env.APP_FIRECRACKER_RUNTIME_KEY ??
            '/run/secrets/firecracker-client/tls.key',
        ),
        rejectUnauthorized: true,
        servername: node.serverName || new URL(node.baseUrl).hostname,
      },
      connectTimeout: 5_000,
      headersTimeout: 65_000,
      bodyTimeout: 0,
    });
    this.dispatchers.set(key, dispatcher);
    return dispatcher;
  }

  /**
   * 节点是跨租户共享的物理基础设施，任意租户 admin 都能改会导致越权。
   * private 部署只有一个租户，直接放行；saas 需显式白名单，默认空 = 全部拒绝。
   */
  assertNodeAdmin(tenantId: string): void {
    if (process.env.APP_DEPLOYMENT_MODE !== 'saas') return;
    const allowed = (process.env.APP_SANDBOX_NODE_ADMIN_TENANT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowed.includes(tenantId)) {
      throw new SandboxNodeAdminForbiddenException();
    }
  }

  private invalidate(): void {
    this.cache = undefined;
    this.cacheLoadedAt = 0;
  }

  private async loadCache(): Promise<Map<string, SandboxRuntimeNode>> {
    if (this.cache && Date.now() - this.cacheLoadedAt < CACHE_TTL_MS) {
      return this.cache;
    }
    const nodes = await this.db.select().from(schema.sandboxRuntimeNodes);
    this.cache = new Map(nodes.map((node) => [node.id, node]));
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }
}

/**
 * 校验并规范化节点基址。https 是硬要求：manager 只接受 mTLS，明文 http 会在
 * 连接期才失败，届时已经吃掉一次调度重试。
 */
function assertBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new SandboxConfigValidationException(
      `node baseUrl "${baseUrl}" is not a valid URL`,
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new SandboxConfigValidationException(
      `node baseUrl "${baseUrl}" must use https (mTLS is mandatory)`,
    );
  }
  return baseUrl.trim().replace(/\/+$/, '');
}
