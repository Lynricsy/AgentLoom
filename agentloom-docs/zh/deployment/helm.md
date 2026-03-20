# Kubernetes / Helm 部署

使用 Helm Chart 在 Kubernetes 集群上部署 AgentLoom，支持弹性伸缩和高可用。

## 前置要求

- Kubernetes 1.28+
- Helm 3.12+
- 集群至少 8 vCPU / 16 GiB 可分配资源
- 持久化存储（StorageClass 支持动态 PVC）
- Ingress Controller（推荐 nginx-ingress 或 Traefik）

## Chart 概览

| 属性 | 值 |
|------|------|
| Chart 版本 | `0.1.0` |
| App 版本 | `0.0.1` |
| Chart 名称 | `agentloom` |
| 路径 | `agentloom-deploy/kubernetes/helm/agentloom/` |

## 快速安装

```bash
# 1. 创建命名空间
kubectl create namespace agentloom

# 2. 准备 values 文件
cp values.yaml my-values.yaml
# 编辑 my-values.yaml，配置域名、密码、镜像等

# 3. 安装
helm install agentloom ./agentloom-deploy/kubernetes/helm/agentloom \
  -n agentloom \
  -f my-values.yaml

# 4. 验证
kubectl get pods -n agentloom
helm status agentloom -n agentloom
```

## 模板清单

Chart 包含 15 个 Kubernetes 模板：

| 模板文件 | 资源类型 | 说明 |
|---------|---------|------|
| `_helpers.tpl` | — | 模板辅助函数（含 BYOD 校验） |
| `configmap.yaml` | ConfigMap | 共享环境变量 |
| `secret.yaml` | Secret | 敏感配置（密码、密钥） |
| `pvc.yaml` | PersistentVolumeClaim | 持久化存储声明 |
| `hpa.yaml` | HorizontalPodAutoscaler | 自动水平扩缩容 |
| `ingress.yaml` | Ingress | 外部流量入口 |
| `service-server.yaml` | Service | Server API 服务 |
| `service-studio.yaml` | Service | Studio 前端服务 |
| `deployment-server.yaml` | Deployment | Server API 部署 |
| `deployment-studio.yaml` | Deployment | Studio 前端部署 |
| `deployment-worker.yaml` | Deployment | Worker 后台任务部署 |
| `dependencies-postgres.yaml` | Deployment + Service + PVC | PostgreSQL（可选内置） |
| `dependencies-redis.yaml` | Deployment + Service + PVC | Redis（可选内置） |
| `dependencies-minio.yaml` | Deployment + Service + PVC | MinIO（可选内置） |
| `dependencies-qdrant.yaml` | Deployment + Service + PVC | Qdrant（可选内置） |

## values.yaml 配置

### 环境变量

```yaml
env:
  shared:
    # Server 和 Worker 共享的环境变量
    DATABASE_URL: "postgresql://agentloom:password@postgres:5432/agentloom"
    REDIS_URL: "redis://:password@redis:6379/0"
    MINIO_ENDPOINT: "http://minio:9000"
    QDRANT_URL: "http://qdrant:6333"

  server:
    # Server 专用配置
    JWT_SECRET: "<你的 JWT 密钥>"
    ENCRYPTION_KEY: "<你的加密密钥>"

  studio:
    # Studio 运行时变量
    VITE_API_URL: "https://your-domain.com"
    VITE_WS_URL: "wss://your-domain.com"
```

### 应用部署配置

```yaml
server:
  replicaCount: 1
  image:
    repository: agentloom/server
    tag: latest
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: "2"
      memory: 2Gi

worker:
  replicaCount: 1
  image:
    repository: agentloom/server    # 与 server 共享镜像
    tag: latest
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: "2"
      memory: 2Gi

studio:
  replicaCount: 1
  image:
    repository: agentloom/studio
    tag: latest
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi
```

### 基础设施依赖

每个基础设施服务都有 `.enabled` 开关，允许切换到外部托管服务：

```yaml
postgres:
  enabled: true           # 设为 false 则使用外部数据库
  persistence:
    size: 20Gi
    storageClass: ""      # 使用默认 StorageClass

redis:
  enabled: true
  persistence:
    size: 5Gi

minio:
  enabled: true
  persistence:
    size: 50Gi

qdrant:
  enabled: true
  persistence:
    size: 10Gi
```

::: tip BYOD (Bring Your Own Database)
当 `postgres.enabled: false` 时，Chart 的 `_helpers.tpl` 中的 **fail() 校验**会自动检查 `env.shared.DATABASE_URL` 是否已配置，避免遗漏外部连接信息导致部署失败。其他基础设施服务同理。
:::

### Ingress 配置

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: agentloom.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: agentloom-tls
      hosts:
        - agentloom.example.com
```

### HPA 自动扩缩

```yaml
hpa:
  enabled: false
  minReplicas: 1
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

## 生产配置示例

Chart 提供了 `values.private.yaml` 作为生产环境参考：

```yaml
# 生产配置要点
server:
  replicaCount: 2           # 双副本高可用
  resources:
    requests:
      cpu: "1"
      memory: 1Gi
    limits:
      cpu: "4"
      memory: 4Gi

worker:
  replicaCount: 2

ingress:
  enabled: true
  tls:                       # 启用 TLS
    - secretName: agentloom-tls
      hosts:
        - agentloom.example.com

postgres:
  persistence:
    size: 50Gi               # 生产级存储

minio:
  persistence:
    size: 100Gi
```

## 升级

```bash
# 使用新 values 升级
helm upgrade agentloom ./agentloom-deploy/kubernetes/helm/agentloom \
  -n agentloom \
  -f my-values.yaml

# 查看历史版本
helm history agentloom -n agentloom

# 回滚到上一版本
helm rollback agentloom -n agentloom
```

## 卸载

```bash
# 卸载 release（保留 PVC）
helm uninstall agentloom -n agentloom

# 如需清除持久化数据
kubectl delete pvc -l app.kubernetes.io/instance=agentloom -n agentloom
```

## 与 Docker Compose 的差异

| 特性 | Docker Compose | Helm |
|------|---------------|------|
| 运行环境 | 单机 | Kubernetes 集群 |
| 扩缩容 | 手动 `scale` | HPA 自动 |
| 高可用 | 无 | 多副本 + 自愈 |
| 存储 | 本地 Volume | PVC 动态供给 |
| 网络 | Docker bridge | K8s Service + Ingress |
| 备份调度 | systemd timer | CronJob |
| 证书管理 | 手动 | cert-manager 自动 |
| 复杂度 | 低 | 高 |

::: warning 备份调度差异
Docker Compose 模式使用 systemd timer 进行定时备份。在 Kubernetes 环境中，应使用 **CronJob** 替代，目前 Helm Chart 尚未内置 CronJob 模板，需手动创建。
:::
