---
docType: howto
---

# 新增环境变量

一个新的配置项要在本地开发、Docker Compose、Helm 三种运行方式下都能被设置，并出现在 [配置参考](/deploy/configuration) 中。server 变量与 Studio 变量走两条不同的路径，按你要加的变量选一节。

前置条件：已能在本地运行 server 或 Studio（[搭建本地开发环境](/dev/setup)）。

## server 变量（`APP_` 前缀）

下文以变量 APP_WIDGET_TIMEOUT_MS（示例名，仓库中不存在）为例。

### 1. 在 env schema 中声明

server 启动时用 `agentloom-server/src/config/env.schema.ts` 的 `envSchema` 校验全部环境变量（`agentloom-server/src/config/config.module.ts` 中 `safeParse`），校验失败进程直接退出。在 `baseEnvSchema` 中加字段，写清类型、默认值与错误信息：

```ts
// agentloom-server/src/config/env.schema.ts（baseEnvSchema 内）
APP_WIDGET_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
```

没有默认值的字段即为必填。读取处用注入的 `ConfigService` 的 `get()`（参照 `agentloom-server/src/app.module.ts` 中读取 `APP_REDIS_URL` 的写法），不要直接读 `process.env`，否则 schema 的默认值与校验不生效。

漏掉这一步时单测会失败：`agentloom-server/src/config/__tests__/env.schema.spec.ts` 的「server 代码读取的环境变量都在 envSchema 中声明」扫描 `agentloom-server/src` 中以字面量读取的键（`configService.get('…')` 与 `process.env.APP_…`），列出所有未在 `envSchema` 中声明的键。

### 2. 写进 `.env.example`

在 `agentloom-server/.env.example` 中加一行，并在它正上方用连续的 `#` 注释写说明——生成器把这段注释作为配置参考中的「说明」列：

```dotenv
# Widget 外部调用超时（毫秒）
APP_WIDGET_TIMEOUT_MS=30000
```

### 3. 接入 Docker Compose

`agentloom-deploy/docker-compose.yml` 的 server、worker 等服务共用 `environment: &server-env` 锚点，变量逐个列出，不使用 `env_file`。在锚点下加：

```yaml
    APP_WIDGET_TIMEOUT_MS: ${APP_WIDGET_TIMEOUT_MS:-30000}
```

需要部署者修改的变量，同时在 `agentloom-deploy/.env.template` 中加一行带注释的默认值；部署者从这个模板生成 `agentloom-deploy/` 下的 `.env`。

### 4. 接入 Helm

在 `agentloom-deploy/kubernetes/helm/agentloom/values.yaml` 的 `env` 下选择位置：非敏感值放 `env.shared`（server 与 worker 共享）或 `env.server`；然后在模板中显式映射——非敏感值加到 `agentloom-deploy/kubernetes/helm/agentloom/templates/configmap.yaml`，敏感值加到 `agentloom-deploy/kubernetes/helm/agentloom/templates/secret.yaml`。两个模板都是逐键列出的，只改 values 不会生效。server 与 worker 的 Deployment 通过 `envFrom` 引用这两个对象。

```yaml
# agentloom-deploy/kubernetes/helm/agentloom/templates/configmap.yaml
  APP_WIDGET_TIMEOUT_MS: {{ .Values.env.shared.APP_WIDGET_TIMEOUT_MS | quote }}
```

渲染检查：

```bash
helm template agentloom agentloom-deploy/kubernetes/helm/agentloom | grep APP_WIDGET_TIMEOUT_MS
```

输出中出现新变量及其取值，形式与现有变量相同，例如 `APP_SANDBOX_ROLLBACK_HOURS: "168"`。

## Studio 变量（`VITE_` 前缀）

Vite 在构建期把 `import.meta.env.VITE_*` 内联进产物，而部署镜像需要在容器启动时才决定取值，所以 Studio 变量多一步占位符替换。下文以变量 VITE_WIDGET_LIMIT（示例名）为例。

1. 在 `agentloom-studio/src/vite-env.d.ts` 的 `ImportMetaEnv` 中声明类型。
2. 在 `agentloom-studio/.env.example` 中加一行与上方注释（同样作为配置参考的说明列）。
3. 在 `agentloom-deploy/docker/studio.Dockerfile` 中：构建阶段加一行与现有 `ARG VITE_API_BASE_URL=__VITE_API_BASE_URL__` 同形的 ARG，让产物里留下占位符；在生成 `/docker-entrypoint.d/40-runtime-env.sh` 的段落中，照抄 `VITE_API_BASE_URL` 的取值行与 `sed` 替换行各加一行。
4. Compose 的 studio 服务与 Helm 的 `env.studio`（以及 `configmap.yaml` 中的映射）各加一行。

在本地开发时 Vite 直接读 `agentloom-studio/` 下的 `.env`，不经过占位符；改完 `.env` 需重启 `pnpm dev`。

## 生成参考并检查

在仓库根执行：

```bash
pnpm docs:gen
pnpm docs:check
```

`agentloom-docs/_generated/env-server.md`（来自 env schema 与 `.env.example`）、`agentloom-docs/_generated/env-deploy.md`（来自 `.env.template`）、`agentloom-docs/_generated/env-studio.md`（来自 Studio `.env.example`）出现新变量。`docs:check` 会校验文档里反引号中的变量名都能在代码或模板中找到，退出码为 0 即通过。把 `_generated/` 的变更与代码一起提交；变量影响部署方式时，同时更新 [Helm 部署](/deploy/helm) 或 [Compose 部署](/deploy/compose) 页。
