---
docType: howto
---

# Helm 部署

在已有 Kubernetes 集群上部署 AgentLoom 时用本页。Chart 位于 `agentloom-deploy/kubernetes/helm/agentloom/`（`Chart.yaml` 版本 `0.1.0`），默认值在 `agentloom-deploy/kubernetes/helm/agentloom/values.yaml`，生产参考覆盖文件是 `agentloom-deploy/kubernetes/helm/agentloom/values.private.yaml`。本页的键名与行为全部取自这两个文件与 `templates/`。

::: warning 未在本轮验证
本页只在本地执行过 `helm lint` 与 `helm template`（输出见下文），没有在真实集群上 `helm install`。
:::

## 前置条件

- Kubernetes 集群、`helm`（本页命令用 v4.3.0 执行）、一个 Ingress Controller（默认 `ingress.className: nginx`）。
- 集群能拉取 server、studio、firecracker-runtime 镜像。Chart 默认镜像是 `agentloom/server:private-local`、`agentloom/studio:private-local`、`agentloom/firecracker-runtime:1.16.1`，它们是本地构建的标签，不在公共仓库；构建后推到你的镜像仓库，再用 `--set` 或覆盖文件改 `*.image.repository` / `*.image.tag`。构建方法见 [Docker Compose 部署](/deploy/compose) 与 [Firecracker 沙箱](/deploy/firecracker)。
- 承载 `firecracker-runtime` 的节点满足 KVM、TUN、cgroup v2、nftables 等条件，见 [Firecracker 沙箱](/deploy/firecracker)。
- 数据库迁移：Chart 不包含迁移 Job 或 hook。首次部署和每次升级前，用 server 镜像的 `migrator` 构建阶段（`agentloom-deploy/docker/server.Dockerfile`）对目标数据库执行 `pnpm db:migrate`。

## 1. 检查渲染结果

```bash
helm lint agentloom-deploy/kubernetes/helm/agentloom
```

```text
==> Linting agentloom-deploy/kubernetes/helm/agentloom
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

用默认值渲染出的资源（release 名 `agentloom`）：

```bash
helm template agentloom agentloom-deploy/kubernetes/helm/agentloom | grep -E '^kind:|^  name:' | paste -d ' ' - - | sort
```

```text
kind: ConfigMap   name: agentloom-agentloom-server-config
kind: ConfigMap   name: agentloom-agentloom-studio-config
kind: Deployment   name: agentloom-agentloom-minio
kind: Deployment   name: agentloom-agentloom-postgres
kind: Deployment   name: agentloom-agentloom-qdrant
kind: Deployment   name: agentloom-agentloom-redis
kind: Deployment   name: agentloom-agentloom-server
kind: Deployment   name: agentloom-agentloom-studio
kind: Deployment   name: agentloom-agentloom-worker
kind: Ingress   name: agentloom-agentloom
kind: PersistentVolumeClaim   name: agentloom-agentloom-minio
kind: PersistentVolumeClaim   name: agentloom-agentloom-postgres
kind: PersistentVolumeClaim   name: agentloom-agentloom-qdrant
kind: PersistentVolumeClaim   name: agentloom-agentloom-redis
kind: Secret   name: agentloom-agentloom-internal-secret
kind: Secret   name: agentloom-agentloom-server-secret
kind: Service   name: agentloom-agentloom-firecracker-runtime
kind: Service   name: agentloom-agentloom-firecracker-runtime-headless
kind: Service   name: agentloom-agentloom-minio
kind: Service   name: agentloom-agentloom-postgres
kind: Service   name: agentloom-agentloom-qdrant
kind: Service   name: agentloom-agentloom-redis
kind: Service   name: agentloom-agentloom-server
kind: Service   name: agentloom-agentloom-studio
kind: Service   name: agentloom-agentloom-worker
kind: StatefulSet   name: agentloom-agentloom-firecracker-runtime
```

Chart 不渲染文档站、Supabase、反向代理、备份任务，也没有 CronJob。HPA 只在对应 `autoscaling.enabled: true` 时渲染。

## 2. 创建 Firecracker PKI Secret

`firecrackerRuntime.managerPkiSecretName`（默认 `agentloom-firecracker-manager-pki`）挂载到 runtime Pod 的 `/run/secrets/firecracker`，需要包含整套 PKI 文件；runtime 的 readinessProbe 也用其中的 `app-client.crt` / `app-client.key`。`firecrackerRuntime.clientPkiSecretName`（默认 `agentloom-firecracker-client-pki`）挂载到 server 与 worker，只包含 `manager-ca.crt`、`app-client.crt`、`app-client.key`。

`./scripts/generate-firecracker-pki.sh`（在 `agentloom-deploy/` 下运行）结束时会打印两条对应的 `kubectl create secret generic` 命令，形如：

```bash
kubectl create secret generic agentloom-firecracker-manager-pki \
  --from-file=agentloom-deploy/secrets/firecracker
kubectl create secret generic agentloom-firecracker-client-pki \
  --from-file=manager-ca.crt=agentloom-deploy/secrets/firecracker/manager-ca.crt \
  --from-file=app-client.crt=agentloom-deploy/secrets/firecracker/app-client.crt \
  --from-file=app-client.key=agentloom-deploy/secrets/firecracker/app-client.key
```

多个 runtime 副本共用同一张 manager 证书，证书 SAN 需要覆盖各 Pod 的 DNS 名：生成 PKI 前设置 `FIRECRACKER_MANAGER_EXTRA_SANS`，见 [Firecracker 沙箱](/deploy/firecracker#多节点)。

## 3. 写覆盖文件并安装

以 `values.private.yaml` 为起点，至少替换所有 `replace-me-*` / `change-me-*` 值、`REPLACE_WITH_BASE64_32_BYTES`、域名与 TLS Secret，然后：

```bash
helm install agentloom agentloom-deploy/kubernetes/helm/agentloom \
  -f agentloom-deploy/kubernetes/helm/agentloom/values.private.yaml \
  -f my-values.yaml
```

`my-values.yaml` 是你自己的覆盖文件，不要提交到仓库。

## values 键参考

### 入口

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `ingress.enabled` | `true` | 渲染 Ingress |
| `ingress.className` | `nginx` | `ingressClassName` |
| `ingress.annotations` | `{}` | 原样写入 Ingress |
| `ingress.host` | `agentloom.local` | 唯一 host 规则 |
| `ingress.tls.enabled` / `ingress.tls.secretName` | `false` / `""` | 启用后用该 Secret 终止 TLS |

Ingress 只有三条 `Prefix` 路径：`/api` 与 `/socket.io` 到 server Service，`/` 到 studio Service。没有 `/documentation/` 与 `/auth/`，与 Compose 的 [反向代理](/deploy/reverse-proxy) 不同。

### 环境变量

`env.shared` 与 `env.server` 渲染进 `<release>-agentloom-server-config`（ConfigMap）和 `<release>-agentloom-server-secret`（Secret），server 与 worker 都以 `envFrom` 读取；`env.studio` 渲染进 `<release>-agentloom-studio-config`。键名与 [配置参考](/deploy/configuration) 的变量相同。

| 键 | 去向 | 留空时 |
| --- | --- | --- |
| `env.shared.APP_DATABASE_URL` | Secret | `postgres.enabled: true` 时由 `postgres.auth.*` 拼出；否则渲染失败，报 `env.shared.APP_DATABASE_URL must be set when postgres.enabled=false` |
| `env.shared.APP_REDIS_URL` | Secret | 同上规则，取 `redis.auth.password` |
| `env.shared.APP_MINIO_ENDPOINT` / `APP_MINIO_PORT` / `APP_MINIO_ACCESS_KEY` / `APP_MINIO_SECRET_KEY` | ConfigMap / Secret | 同上规则，取内置 MinIO 的 Service 名、`minio.service.apiPort`、`minio.auth.*` |
| `env.shared.APP_QDRANT_URL` | ConfigMap | 同上规则，取内置 Qdrant Service |
| `env.shared.APP_FIRECRACKER_RUNTIME_URL` | ConfigMap | `https://<release>-agentloom-firecracker-runtime:<firecrackerRuntime.service.port>` |
| `env.shared.APP_FIRECRACKER_RUNTIME_CA` / `_CERT` / `_KEY` | ConfigMap | 默认指向 `/run/secrets/firecracker/` 下的 client PKI 文件 |
| `env.shared.APP_FIRECRACKER_RUNTIME_SERVER_NAME` | ConfigMap | `firecracker-runtime`（与 manager 证书 SAN 一致） |
| `env.shared.APP_SANDBOX_MAINTENANCE_MODE` / `APP_SANDBOX_ROLLBACK_HOURS` / `APP_SANDBOX_NODE_ADMIN_TENANT_IDS` | ConfigMap | `"false"` / `"168"` / `""` |
| `env.shared.APP_PORT` / `APP_NODE_ENV` / `APP_DEPLOYMENT_MODE` / `APP_MINIO_USE_SSL` / `APP_MINIO_BUCKET` | ConfigMap | `"3000"` / `production` / `private` / `"false"` / `agentloom-documents` |
| `env.server.APP_JWT_SECRET` / `APP_MASTER_ENCRYPTION_KEY` / `APP_SUPABASE_*` / `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY` / `FIREBASE_SERVICE_ACCOUNT` | Secret | 原样写入 |
| `env.server.APP_OAUTH_REDIRECT_URL` / `APP_FRONTEND_URL` | ConfigMap | 原样写入 |
| `env.studio.VITE_API_BASE_URL` / `VITE_AUTOSAVE_DEBOUNCE_MS` | studio ConfigMap | `/api/v1` / `"500"` |

`APP_SANDBOX_CALLBACK_BASE_URL` 不在 values 中：模板为 server 写 `http://<release>-agentloom-server:3000/api/v1`，为 worker 写 `http://<release>-agentloom-worker:3000/api/v1`。studio ConfigMap 只有两个键，`VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 不由 Chart 提供。

### 应用

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `server.replicaCount` | `1` | `server.autoscaling.enabled: true` 时不渲染 replicas |
| `server.image.repository` / `tag` / `pullPolicy` | `agentloom/server` / `private-local` / `IfNotPresent` | worker 共用该镜像 |
| `server.command` | `["node", "dist/src/main.js"]` | server 与 worker 共用 |
| `server.service.port` | `3000` | server 与 worker Service 端口；探针路径 `/api/v1/health` |
| `server.autoscaling.{enabled,minReplicas,maxReplicas,targetCPUUtilizationPercentage}` | `false` / `1` / `3` / `80` | 渲染 `autoscaling/v2` HPA |
| `worker.enabled` / `worker.replicaCount` | `true` / `1` | |
| `worker.autoscaling.*` | 同 server | |
| `studio.replicaCount` | `1` | |
| `studio.image.repository` / `tag` | `agentloom/studio` / `private-local` | |
| `studio.service.port` / `targetPort` | `80` / `8080` | |
| `studio.autoscaling.*` | 同 server | |
| `*.resources` / `nodeSelector` / `tolerations` / `affinity` | 空 | 原样写入 Pod |

### Firecracker runtime

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `firecrackerRuntime.enabled` | `true` | 渲染 StatefulSet 与两个 Service |
| `firecrackerRuntime.replicas` | `1` | 每个副本是一个独立的沙箱运行时节点 |
| `firecrackerRuntime.image.repository` / `tag` | `agentloom/firecracker-runtime` / `1.16.1` | |
| `firecrackerRuntime.service.port` | `8443` | mTLS 端口 |
| `firecrackerRuntime.managerPkiSecretName` | `agentloom-firecracker-manager-pki` | 挂到 runtime |
| `firecrackerRuntime.clientPkiSecretName` | `agentloom-firecracker-client-pki` | 挂到 server / worker |
| `firecrackerRuntime.state.existingClaim` | `""` | 为空时用 `volumeClaimTemplates`，每个副本一个 RWO PVC |
| `firecrackerRuntime.state.storageClassName` / `size` | `""` / `250Gi` | |
| `firecrackerRuntime.guestCIDR` / `gateway` | `172.30.0.0/16` / `172.30.0.1` | 对应 `FIRECRACKER_GUEST_CIDR` / `FIRECRACKER_GATEWAY` |
| `firecrackerRuntime.allowedPrivateCIDRs` | `[]` | 以逗号连接后写入 `FIRECRACKER_EGRESS_ALLOWED_PRIVATE_CIDRS` |
| `firecrackerRuntime.maxVMs` / `maxVCPU` / `maxMemoryMiB` / `maxDiskGiB` | `"20"` / `"20"` / `"40960"` / `"200"` | 对应 `FIRECRACKER_MAX_VMS` / `FIRECRACKER_MAX_VCPU` / `FIRECRACKER_MAX_MEMORY_MIB` / `FIRECRACKER_MAX_DISK_GIB` |
| `firecrackerRuntime.allowUnsupportedKernel` / `smtPolicy` | `"false"` / `deny` | 对应 `FIRECRACKER_ALLOW_UNSUPPORTED_KERNEL` / `FIRECRACKER_SMT_POLICY` |
| `firecrackerRuntime.resources.limits` | `cpu: "24"`、`memory: 48Gi` | |
| `firecrackerRuntime.nodeSelector` / `tolerations` / `affinity` | 空 | 用它把 runtime 固定到通过预检的节点 |

runtime Pod 以 `privileged: true`、`hostPID: true`、`readOnlyRootFilesystem: true` 运行，以 hostPath 挂载 `/dev/kvm`、`/dev/net/tun`、`/sys/fs/cgroup`。StatefulSet 模板不设置 `FIRECRACKER_ENV` 与 `FIRECRACKER_ALLOW_SWAP`。

### 内置数据依赖

| 键 | 默认 |
| --- | --- |
| `postgres.enabled` / `image` / `auth.{user,password,database}` / `service.port` | `true` / `postgres:16-alpine` / `agentloom`、`change-me-db-password`、`agentloom` / `5432` |
| `postgres.persistence.{enabled,existingClaim,storageClassName,size}` | `true` / `""` / `""` / `20Gi` |
| `redis.enabled` / `image` / `auth.password` / `service.port` | `true` / `redis:7-alpine` / `change-me-redis-password` / `6379` |
| `redis.persistence.size` | `5Gi` |
| `minio.enabled` / `image` / `auth.{rootUser,rootPassword}` / `service.{apiPort,consolePort}` | `true` / `minio/minio:latest` / `agentloom`、`change-me-minio-password` / `9000`、`9001` |
| `minio.persistence.size` | `50Gi` |
| `qdrant.enabled` / `image` / `service.{httpPort,grpcPort}` | `true` / `qdrant/qdrant:v1.17.0` / `6333`、`6334` |
| `qdrant.persistence.size` | `20Gi` |

设 `*.enabled: false` 改用外部服务时，必须同时填写对应的 `env.shared` 连接变量，否则渲染失败（见上文环境变量表）。

::: warning 已知问题：MinIO 镜像
`minio.image` 默认 `minio/minio:latest`。2026-10-01 在本仓库维护者的宿主上执行 `docker pull minio/minio:latest` 返回 `pull access denied for minio/minio, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`。若你的集群同样拉取失败，用 `minio.image.repository` / `minio.image.tag` 指向可拉取的 MinIO 镜像；Compose 实跑时使用的替代见 [Docker Compose 部署](/deploy/compose)。
:::

## 多个沙箱运行时节点

`firecrackerRuntime.replicas` 大于 1 时，headless Service `<release>-agentloom-firecracker-runtime-headless` 为每个 Pod 提供稳定 DNS 名 `<release>-agentloom-firecracker-runtime-N.<release>-agentloom-firecracker-runtime-headless.<namespace>.svc`。每个副本要在 `/api/v1/sandbox-nodes` 登记为一个节点，baseUrl 用上述 DNS 名加 `:8443`。步骤见 [Firecracker 沙箱](/deploy/firecracker#多节点)。

## 相关

- [部署拓扑](/deploy/#compose-与-helm)：Compose 与 Helm 的差异
- [配置参考](/deploy/configuration)
