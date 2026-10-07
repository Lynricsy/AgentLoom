---
docType: howto
---

# Firecracker 沙箱

Agent 以 `sandbox` 运行模式执行时，代码跑在 Firecracker microVM 里。本页说明如何让一台宿主承载 microVM：宿主条件、证书、产物构建、启动与冒烟、增加节点、从旧 Docker 沙箱迁移。runtime manager 的内部实现见 [/dev/firecracker-runtime](/dev/firecracker-runtime)。

在 Compose 拓扑中，`firecracker-runtime` 是单实例特权容器（`privileged`、`pid: host`、`cgroup: host`、只读根文件系统），挂载 `/dev/kvm`、`/dev/net/tun` 与宿主 `/sys/fs/cgroup`，在 Docker 网络内以 mTLS 监听 8443。server 与 worker 只持有客户端证书。runtime 不可用或校验失败时沙箱请求直接失败，不会退回到 Docker 或宿主执行。

## 宿主预检

runtime manager 启动时执行预检（`agentloom-firecracker-runtime/internal/preflight/check.go`），任一项不通过即退出，容器不会健康。runtime 属于 Compose profile `sandbox`（`.env.template` 默认 `COMPOSE_PROFILES=sandbox`），server 与 worker 对它是可选依赖（`required: false`）：预检失败时 Compose 打印 `optional dependency "firecracker-runtime" failed to start` 警告后照常启动 server 与 worker，只有 sandbox 运行态的 Agent 不可用（见 [部署拓扑](/deploy/#启动依赖)）：

| 检查 | 要求 | 放宽方式 |
| --- | --- | --- |
| 平台 | `linux/amd64`，页大小 4096 | 无 |
| 宿主内核 | 版本以 `6.18.` 开头 | `FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL=true` |
| 设备 | `/dev/kvm`、`/dev/net/tun` 可读写 | 无（Compose 不暴露 `FIRECRACKER_PREFLIGHT_SKIP_DEVICES`） |
| cgroup | 存在 `/sys/fs/cgroup/cgroup.controllers`（cgroup v2） | 无 |
| 命令 | `firecracker`、`jailer`、`ip`、`tc`、`nft`（镜像内自带） | 无 |
| swap | `/proc/swaps` 中没有启用的 swap | `FIRECRACKER_ALLOW_SWAP=true`，且必须同时 `FIRECRACKER_ENV=test`，否则 manager 以 `FIRECRACKER_ALLOW_SWAP is restricted to FIRECRACKER_ENV=test` 退出 |
| SMT | `/sys/devices/system/cpu/smt/active` 不为 `1` | `FIRECRACKER_SMT_POLICY=allow` |
| guest 网段 | `FIRECRACKER_GUEST_CIDR`（默认 `172.30.0.0/16`）不与容器内任何接口地址重叠 | 换网段 |
| 状态目录 | `FIRECRACKER_STATE_ROOT` 可创建、不含符号链接 | 无 |
| 产物 | `manifest.json` 版本正确，每个文件的 SHA-256 与清单一致，`vmlinux` 是 x86-64 ELF | 重新构建产物 |

预检通过时日志打印 `"msg":"Firecracker preflight passed"` 及各项结果；放宽项出现在 `warnings` 中。实际输出见 [Docker Compose 部署](/deploy/compose#_8-检查沙箱运行时)。`FIRECRACKER_ENV`、`FIRECRACKER_ALLOW_SWAP` 只在 `agentloom-deploy/docker-compose.yml` 中有默认值（`production`、`false`），不在 `.env.template` 里；Helm 模板不设置这两个变量。

## 1. 生成证书

在 `agentloom-deploy/` 下：

```bash
./scripts/generate-firecracker-pki.sh
```

脚本生成三个互相独立的信任域：Manager CA（manager 服务端证书，SAN 为 `firecracker-runtime`、`agentloom-firecracker-runtime`、`localhost`、`127.0.0.1`）、Client CA（server/worker 用的 `app-client` 证书与健康检查用的 `health-client` 证书）、Guest CA（manager 用它给 guest 签证书）。输出目录默认 `secrets/firecracker/`，已存在时拒绝覆盖；可把输出目录作为第一个参数传入。环境变量 `FIRECRACKER_MANAGER_EXTRA_SANS`（形如 `DNS:node-1.fc.internal,IP:10.0.0.11`）为 manager 证书追加 SAN。

server 与 worker 容器以 uid/gid 1000 运行，Compose 的文件型 secret 是宿主文件的绑定挂载，所以脚本把 `app-client.key` 设为 0640、属组 1000。复制或迁移这些文件时要保留属组；属组丢失后 server 日志出现 `Sandbox runtime node default probe failed: Error: EACCES: permission denied, open '/run/secrets/firecracker-client-key'`，节点被判为不健康。

Compose 通过 8 个 secret 把文件交给容器（`agentloom-deploy/docker-compose.yml` 末尾的 `secrets:`），每个都可用 `FIRECRACKER_*_FILE` 变量改路径：

| secret | 默认文件 | 使用者 |
| --- | --- | --- |
| `firecracker-manager-cert` / `firecracker-manager-key` | `manager.crt` / `manager.key` | runtime |
| `firecracker-manager-ca` | `manager-ca.crt` | runtime、server、worker |
| `firecracker-client-ca` | `client-ca.crt` | runtime |
| `firecracker-client-cert` / `firecracker-client-key` | `app-client.crt` / `app-client.key` | server、worker |
| `firecracker-health-client-cert` / `firecracker-health-client-key` | `health-client.crt` / `health-client.key` | runtime 健康检查 |
| `firecracker-guest-ca` / `firecracker-guest-ca-key` | `guest-ca.crt` / `guest-ca.key` | runtime |

## 2. 构建产物与镜像

产物来源锁定在 `agentloom-deploy/firecracker/artifact-lock.json`：Firecracker 1.16.1 发布包、Amazon microVM 内核源码与配置、BusyBox、Arch Linux OCI digest 与快照日期、rootfs 大小（`rootfs.sizeGiB`，当前 4 GiB，容纳 guest 服务及其含 DeepSeek Harness 的生产依赖）。升级时同步更新其中的 URL、提交、SHA-256，不要只替换生成物。

```bash
./firecracker/build-artifacts.sh
```

脚本要求 Linux x86_64 与 `curl`、`docker`、`go`、`jq`、`mke2fs`、`npm`、`od`、`sha256sum`、`tar`、`tr`。步骤：下载并校验 SHA-256 → 构建 `agentloom-deploy/sandbox`（`npm ci`、typecheck、build）与 Go 程序 `agentloom-guestd` → 用 `agentloom-deploy/firecracker/rootfs.Dockerfile` 构建 ext4 rootfs → 用 `agentloom-deploy/firecracker/kernel-builder.Dockerfile` 编译内核与 initramfs → 写 `firecracker/artifacts/manifest.json`（记录当前 `git rev-parse HEAD`）。guest 内的 `agentloom-guestd` 由 `agentloom-deploy/firecracker/systemd/agentloom-guestd.service` 启动。

`agentloom-deploy/sandbox/package-lock.json` 随仓库跟踪，脚本中的两次 `npm ci`（构建 sandbox、在 rootfs 中只装生产依赖）都按它安装，产物可复现。升级 sandbox 依赖时在该目录运行 `npm install` 并提交更新后的 lockfile。

runtime 镜像由 `agentloom-deploy/firecracker/runtime-manager.Dockerfile` 构建，把 `firecracker/artifacts/` 与 `firecracker/network/` 复制进镜像。两种方式任选：

- `docker compose up -d --build` 时随主栈构建，标签取 `FIRECRACKER_RUNTIME_IMAGE`（默认 `agentloom/firecracker-runtime:1.16.1`）。
- `./firecracker/build-runtime-image.sh`：先重跑 `build-artifacts.sh`，再构建固定标签 `agentloom/firecracker-runtime:1.16.1`。

## 3. 启动与冒烟测试

runtime 随主栈启动，见 [Docker Compose 部署](/deploy/compose)。主要变量（完整列表见 [配置参考](/deploy/configuration)）：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `FIRECRACKER_GUEST_CIDR` / `FIRECRACKER_GATEWAY` | `172.30.0.0/16` / `172.30.0.1` | guest 网段与网关 |
| `FIRECRACKER_EGRESS_ALLOWED_PRIVATE_CIDRS` | 空 | guest 默认不能访问私网与本机地址；只为确需访问的私有 LLM / MCP 填逗号分隔的 IPv4 CIDR |
| `FIRECRACKER_CALLBACK_ALLOWED_HOSTS` | `server,worker` | guest 回调允许的主机名 |
| `FIRECRACKER_MAX_VMS` / `FIRECRACKER_MAX_VCPU` / `FIRECRACKER_MAX_MEMORY_MIB` / `FIRECRACKER_MAX_DISK_GIB` | `20` / `20` / `40960` / `200` | 本节点容量上限，`GET /v1/capacity` 按此汇报 |
| `FIRECRACKER_RUNTIME_CPU_LIMIT` / `FIRECRACKER_RUNTIME_MEMORY_LIMIT` | `24` / `48G` | 容器资源上限 |

### 冒烟测试

runtime 健康后运行冒烟脚本。它通过 `docker compose exec firecracker-runtime` 调用 manager API：创建一台 persistent microVM，检查 guest 健康、执行命令、持久文件、DNS/HTTPS 出站、源地址防伪、私网隔离、dsh 会话创建与 SSE（要求出现 `harness_trace` 事件），退出时删除 VM 与磁盘。

会话使用名为 `smoke` 的 provider 路由。设置 `AGENTLOOM_TEST_MODEL_BASE_URL`、`AGENTLOOM_TEST_MODEL_NAME`、`AGENTLOOM_TEST_MODEL_API_KEY`（可选 `AGENTLOOM_TEST_MODEL_API`，默认 `openai-completions`）时走真实模型，并要求流中有 `text_delta` 且以 `done` 结束；模型地址必须是 guest 可达的公网 HTTPS/HTTP，或已列入 `FIRECRACKER_EGRESS_ALLOWED_PRIVATE_CIDRS`。不设置时不下发密钥，dsh 以缺少凭据结束本轮，脚本只要求出现终止事件。

```bash
./firecracker/firecracker-smoke.sh
```

验证时约 15 秒（不设置测试模型时），最后一行（ID 每次不同）：

```text
Firecracker KVM smoke passed for 79c5559e-e8b1-457a-9afc-fee6c7ef252e
```

## 不启用沙箱

宿主不满足 [宿主预检](#宿主预检)（没有 KVM、内核不是 6.18.x、开着 swap 等）时，在 `agentloom-deploy/` 下的 `.env` 中把 `COMPOSE_PROFILES=sandbox` 改为空值 `COMPOSE_PROFILES=`，然后：

```bash
docker compose up -d
```

Compose 不再创建 `firecracker-runtime` 容器，其余服务照常运行；`GET /api/v1/sandbox-nodes` 中的 `default` 节点显示 `"healthy": false`。此时只能使用 `no_sandbox` 运行态的 Agent。server 与 worker 仍挂载 Firecracker 客户端证书作为 Compose secret，所以上文第 1 步「生成证书」仍要执行，第 2 步「构建产物与镜像」可以跳过。之前已经启动过的 runtime 容器用 `docker compose --profile sandbox stop firecracker-runtime` 停止。

## 多节点

沙箱运行时节点登记在 `sandbox_runtime_nodes` 表，经 `/api/v1/sandbox-nodes` 管理。表为空时 server 首次启动按 `APP_FIRECRACKER_RUNTIME_URL` 与 `APP_FIRECRACKER_RUNTIME_SERVER_NAME` 写入 `default` 节点；表非空后这两个变量不再回写，节点以数据库为准。

创建沙箱时 server 并行请求每个 `active` 节点的 `GET /v1/capacity`，剔除不健康或余量不足的节点，按空闲内存比（剩余内存 / 内存上限）从高到低尝试；节点返回 503 或不可达时换下一个。所有节点都放不下时仍按健康节点逐个尝试，由 manager 的 503 做最终判定。`sandbox_sessions.runtime_handle` 记为 `<nodeId>/<managerHandle>`，之后对该沙箱的所有操作按前缀路由回原节点。

### 接口

需要 owner 或 admin 角色的用户令牌（`Authorization: Bearer <token>`）。`APP_DEPLOYMENT_MODE=private` 时不再做其他检查；`saas` 模式下租户 ID 还必须在 `APP_SANDBOX_NODE_ADMIN_TENANT_IDS` 中，否则 403。

| 方法与路径 | 请求 | 说明 |
| --- | --- | --- |
| `GET /api/v1/sandbox-nodes` | — | 列出节点及实时 `healthy`、`capacity` |
| `POST /api/v1/sandbox-nodes` | `{"id", "baseUrl", "serverName"?, "status"?}` | `id` 为 1–32 位 `[a-z0-9-]`、字母或数字开头；`baseUrl` 必须是 `https://`；`serverName` 是校验 manager 证书用的 TLS 名称；`status` 取 `active` / `draining` / `disabled` |
| `PATCH /api/v1/sandbox-nodes/:nodeId` | `{"baseUrl"?, "serverName"?, "status"?}` | |
| `DELETE /api/v1/sandbox-nodes/:nodeId[?force=true]` | — | 只能删除 `disabled` 节点；节点上仍有 microVM 时 409；节点不可达时需 `force=true` |

验证时（`TOKEN` 为 owner 用户的访问令牌）：

```bash
curl -s http://localhost:8080/api/v1/sandbox-nodes -H "Authorization: Bearer $TOKEN"
```

```json
{
  "data": [
    {
      "id": "default",
      "baseUrl": "https://firecracker-runtime:8443",
      "serverName": "firecracker-runtime",
      "status": "active",
      "createdAt": "2026-10-01T09:58:41.001Z",
      "updatedAt": "2026-10-01T09:58:41.001Z",
      "healthy": true,
      "capacity": {
        "vmsUsed": 0,
        "vmsLimit": 20,
        "vcpuUsed": 0,
        "vcpuLimit": 20,
        "memoryMiBUsed": 0,
        "memoryMiBLimit": 40960,
        "diskGiBUsed": 0,
        "diskGiBLimit": 200
      }
    }
  ]
}
```

`baseUrl` 不是 https 时返回 422，`errors` 中为 `Node baseUrl must use https (mTLS is mandatory)`；删除仍为 `active` 的节点返回 409，`detail` 为 `Sandbox runtime node node-2 is active; PATCH status to "disabled" before deleting it`。下线节点的顺序：`PATCH` 为 `draining`（不再接收新沙箱）→ 等待其上的沙箱结束 → `PATCH` 为 `disabled` → `DELETE`（成功返回 204）。

### 增加一台沙箱服务器

Compose 是单节点：一个 Compose 部署只有一个 `firecracker-runtime`。增加节点时，在另一台满足 [宿主预检](#宿主预检) 的服务器上运行同一个 runtime 镜像，使其 8443 端口能被 server 与 worker 访问，然后登记：

1. 用已有 Manager CA 为新节点签发服务端证书（在原部署的 `agentloom-deploy/` 下）：

   ```bash
   ./scripts/generate-firecracker-pki.sh add-node node-2 'DNS:node-2.fc.internal,IP:10.0.0.12'
   ```

   ```text
   节点服务端证书已生成: /var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/secrets/firecracker/manager-node-2.crt
   把该 crt/key 与 manager-ca.crt、client-ca.crt、guest-ca.* 一起投递到该台沙箱服务器
   ```

   Client CA 与 Guest CA 不变：manager 只校验客户端证书由 Client CA 签发，不校验 CN/SAN，server 与 worker 用同一张 `app-client` 证书访问所有节点。
2. 在新服务器上用这些文件启动 runtime manager，环境变量与挂载参照 `agentloom-deploy/docker-compose.yml` 的 `firecracker-runtime` 服务，并把 `FIRECRACKER_CALLBACK_ALLOWED_HOSTS` 设为 guest 回调要访问的 server / worker 主机名。仓库没有为单独的 runtime 节点提供 compose 文件。
3. 登记节点：

   ```bash
   curl -s -X POST http://localhost:8080/api/v1/sandbox-nodes \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"id":"node-2","baseUrl":"https://node-2.fc.internal:8443","serverName":"node-2.fc.internal"}'
   ```

   返回 `{"data":{"id":"node-2",…,"status":"active"}}`；随后 `GET /api/v1/sandbox-nodes` 中该节点 `healthy` 为 `true` 即可接收沙箱。

::: warning 未在本轮验证
第 2 步（在第二台服务器上启动 runtime）没有实跑；第 1 步与接口的登记、改状态、删除在单机上实跑过（登记时 `baseUrl` 指向同一个 runtime）。
:::

Helm 部署中，`firecrackerRuntime.replicas` 大于 1 时每个 Pod 是一个节点，用 headless Service 的 Pod DNS 名登记，见 [Helm 部署](/deploy/helm#多个沙箱运行时节点)。

## 从 Docker 沙箱迁移

旧版本的沙箱是宿主 Docker 容器与卷。`sandbox-cutover` 服务（Compose profile `migration`，入口 `/usr/local/bin/sandbox-cutover`）把它们迁到 Firecracker，它是唯一挂载 `/var/run/docker.sock` 的服务，且在 compose 中固定 `APP_SANDBOX_MAINTENANCE_MODE: 'true'`。

1. 在 `.env` 中设 `APP_SANDBOX_MAINTENANCE_MODE=true` 并 `docker compose up -d server worker`。维护模式下 server 拒绝新的工作流运行、Agent 执行、Agent API run 与沙箱创建 / 启动（`SandboxMaintenanceException`，HTTP 503）。
2. 等队列排空。每个子命令开始前都检查数据库与 Redis 中没有进行中的沙箱任务，否则失败退出。
3. 依次执行：

   ```bash
   docker compose --profile migration run --rm sandbox-cutover export
   docker compose --profile migration run --rm sandbox-cutover restore
   docker compose --profile migration run --rm sandbox-cutover activate
   ```

   `export` 把旧工作区打包上传到 MinIO；`restore` 在 microVM 中还原并校验（迁移记录变为 `verified`）；`activate` 把会话的 `runtime_handle` 切到 Firecracker。
4. 需要回退时执行 `sandbox-cutover rollback`，把 cutover 之后在 microVM 中的写入带回旧容器。
5. 确认无误后执行 `sandbox-cutover finalize`，删除旧容器与卷。每条迁移在 `verified` 之后要经过 `APP_SANDBOX_ROLLBACK_HOURS` 小时（默认 168）才能 finalize，未到期时报 `migration <session> is still inside rollback window`。`rollback` 与 `finalize` 同样要求队列为空。
6. 把 `APP_SANDBOX_MAINTENANCE_MODE` 改回 `false` 并 `docker compose up -d server worker`。

`./firecracker/test/cutover-rehearsal.sh` 用隔离的数据库、bucket、Redis 队列前缀、旧容器与真实 KVM VM 演练整个流程（含失败路径与 rollback）并清理资源，只在专用开发宿主上运行。

::: warning 未在本轮验证
「从 Docker 沙箱迁移」没有实跑；子命令与顺序取自 `agentloom-firecracker-runtime/cmd/sandbox-cutover/main.go` 与 `agentloom-deploy/firecracker/test/cutover-rehearsal.sh`。
:::

## 备份边界

PostgreSQL 与 MinIO 备份不包含 `firecracker_state` 卷中的 microVM 磁盘。持久沙箱需要保留的内容应写入 Workspace snapshot；runtime 状态只能在 manager 停止后做崩溃一致的块级快照。见 [备份与恢复](/deploy/backup-restore)。

## 为什么是 microVM

Agent 在沙箱里执行任意代码、安装依赖、访问网络。容器与宿主共享内核，一次内核漏洞就能越过隔离；Firecracker 给每个沙箱一个独立的客户机内核，只暴露最小的虚拟设备集，再由 jailer 把 VMM 进程放进 chroot 与 cgroup。网络侧，每台 VM 一个 tap 设备，nftables 规则（`agentloom-deploy/firecracker/network/agentloom-firecracker.nft.template`）只放行 DNS 与 80/443 出站，拒绝私网、链路本地、元数据地址与伪造源地址；guest 对 manager 的回调走单独的 18080 中继。代价是宿主必须有 KVM，且只能运行在 x86_64 Linux 上，所以 runtime 放在 Compose profile `sandbox` 里，不满足条件的宿主可以只跑 `no_sandbox` Agent。
