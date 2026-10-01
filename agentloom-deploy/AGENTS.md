# Repository Guidelines

## 概述

私有部署资产：Compose/OpenResty 入口、应用镜像、数据依赖、可选 Supabase Auth、Firecracker microVM、Helm、备份恢复。应用行为由各应用包实现，跨包规则见根 `AGENTS.md`。
拓扑与操作步骤：`agentloom-docs/deploy/`（`index.md` 起读）；变量参考：`agentloom-docs/deploy/configuration.md`。

## 本包硬规则

- Compose 变量保留 `APP_`、`FIRECRACKER_`、`SUPABASE_` 前缀；生产环境不得保留 `change-me-*` 或 localhost OAuth/site URL。
- private 模式下 Supabase URL、anon key、service key 三者全空或全有；`SUPABASE_JWT_SECRET` 必须等于 `APP_JWT_SECRET`。
- 新增服务声明网络、healthcheck、resource limit、restart 策略与持久卷责任；不得向 server/worker 添加 Docker socket、KVM 或 guest CA 私钥。
- shell 脚本用 Bash + `set -euo pipefail`，`COMPOSE_FILE`/`ENV_FILE` 可覆盖；破坏性恢复先验证输入（路径转绝对、网络/镜像/挂载探测），全部通过后才停止写入者并删库。
- 两个 compose 的 project 名分别由 `AGENTLOOM_PROJECT_NAME`、`AGENTLOOM_SUPABASE_PROJECT_NAME` 决定，模板与脚本不得设置 `COMPOSE_PROJECT_NAME`；主栈网络名只经 `AGENTLOOM_NETWORK_PREFIX` 变化，脚本按 `<前缀>-app` 找 MinIO。
- 第三方镜像固定版本标签，不用 `latest`；MinIO/mc 用 `pgsty/*` 的 RELEASE 标签（官方 Docker Hub 镜像已下架）。
- `firecracker-runtime` 留在 profile `sandbox`，server/worker 对它的依赖保持 `required: false`，不得重新变成硬依赖。
- `sandbox/package-lock.json` 随仓库跟踪，改 sandbox 依赖时一并提交；sandbox 只经 `firecracker/build-artifacts.sh` 发布到 rootfs，不再有 Docker 镜像。
- server Dockerfile 在 workspace install 前复制含 `prepare` 的内部包完整源码，production prune 保留 `--ignore-scripts`，整体复制 workspace 以维持符号链接；pnpm 版本只由根 `package.json` 的 `packageManager` 决定，Dockerfile 不得另行 `corepack prepare`。
- studio 镜像启动时替换 `__VITE_*__` 占位符；新增浏览器运行时变量同步 build args、替换脚本、Compose 与环境模板。
- docs 镜像由 `agentloom-docs/` 构建（同时 COPY `agentloom-server/sdk/openapi.json`），输出到 `/documentation`、监听 8081，不是根路径站点。
- `firecracker/artifact-lock.json` 升级时同步 URL、commit、SHA-256、镜像 tag 与 manifest，不允许只替换生成物。
- `firecracker/test/cutover-rehearsal.sh` 会创建真实 KVM VM 与隔离资源，只在专用开发宿主运行。
- PostgreSQL/MinIO 备份不含 microVM 磁盘；持久 sandbox 的权威内容必须进入 Workspace snapshot。

## 命令

见本包 `README.md`。

## 改动时更新

Compose / Helm / 脚本 / `.env.template` 变化 → 对应 `agentloom-docs/deploy/*.md`，并在仓库根 `pnpm docs:gen`（环境变量表）。
