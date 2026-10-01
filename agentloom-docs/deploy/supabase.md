---
docType: howto
---

# 自托管 Supabase

私有部署需要用户能注册、登录、使用 Google / GitHub OAuth 时，按本页配置自托管 Supabase 认证栈。server 的邮箱注册与登录通过 Supabase GoTrue 完成；`APP_SUPABASE_*` 未配置时 server 仍会启动，但这些接口返回认证不可用错误。

本页覆盖 `agentloom-deploy/docker-compose.supabase.yml`、`agentloom-deploy/supabase/kong.yml` 与入口的 `/auth/` 路由。首次部署的完整顺序见 [Docker Compose 部署](/deploy/compose)，本页解释每一部分并给出公网与 OAuth 的改法。

## 组成

| 服务 | 作用 |
| --- | --- |
| `supabase-db-ready` | 每 2 秒执行一次 `pg_isready -h postgres`，主栈 PostgreSQL 可连后退出 |
| `supabase-auth` | `supabase/gotrue:v2.175.0`，监听 9999；数据库连接串由 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` 拼成，`search_path=auth` |
| `supabase-kong` | `kong:3.9`，无数据库模式，配置为 `agentloom-deploy/supabase/kong.yml`：唯一服务 `auth-v1`，路由 `/auth/v1/` 去掉前缀后转发到 `http://supabase-auth:9999/`，开启 CORS |

三者只接入 `supabase_net`（默认网络名 `supabase-shared`，external）。GoTrue 与主栈共用同一个 PostgreSQL 数据库，表在 `auth` schema；Supabase 栈本身不带数据库。

GoTrue 的固定行为（写在 compose 文件中，不经变量）：允许注册（`GOTRUE_DISABLE_SIGNUP: "false"`）、邮箱注册自动确认（`GOTRUE_MAILER_AUTOCONFIRM: "true"`）、关闭手机号登录、开启 TOTP MFA、令牌有效期 3600 秒、启用自定义 access token hook `pg-functions://postgres/public/custom_access_token_hook`（该函数由 server 迁移 `agentloom-server/src/database/migrations/0004_organization_management.sql` 创建）。

## 与主栈的依赖顺序

1. 主栈 PostgreSQL 需要先运行，并且已执行 `./scripts/init-db.sh` 中的角色与 schema 初始化：脚本创建 `supabase_auth_admin`、`authenticated`、`anon`、`service_role`、`postgres` 角色和 `auth` schema（GoTrue 的迁移会对 `postgres` 角色授权）。
2. GoTrue 首次启动时在 `auth` schema 建表，其中包括 `auth.users`。
3. server 的数据库迁移给 `users.supabase_user_id` 加了指向 `auth.users(id)` 的外键，因此迁移必须在 GoTrue 首次启动之后执行，否则报 `relation "auth.users" does not exist`。

`./scripts/init-db.sh` 按这个顺序执行：创建角色与 `auth` schema → 若 `auth.users` 不存在，执行 `docker compose -f docker-compose.supabase.yml up -d --wait` 并等待 GoTrue 建表 → 执行迁移。因此首次部署只需运行一次 init-db，它会顺带启动整个 Supabase 栈；`auth.users` 已存在时（再次运行）跳过启动。

server 会读取和删除 `auth.sessions` 中的行（`agentloom-server/src/modules/auth/auth.service.ts`）。Compose 默认的 `APP_DATABASE_URL` 使用 `POSTGRES_USER`，它是 PostgreSQL 镜像创建的超级用户，GoTrue 建的表也归它所有，不需要额外授权。若你把 `APP_DATABASE_URL` 换成非超级用户的角色，按 `./scripts/init-db.sh` 的提示执行：

```bash
docker compose exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT SELECT, DELETE ON auth.sessions TO <业务角色>"'
```

`<业务角色>` 换成 `APP_DATABASE_URL` 中的用户名。

## 两个 Compose project

主栈与 Supabase 栈是两个独立的 project，名字分别来自 `.env` 的 `AGENTLOOM_PROJECT_NAME`（默认 `agentloom-private`）与 `AGENTLOOM_SUPABASE_PROJECT_NAME`（默认 `agentloom-supabase`），在各自 compose 文件顶部的 `name:` 中引用。

**不要**在 `.env` 中设置 `COMPOSE_PROJECT_NAME`：Compose 让它优先于文件内的 `name:`，两个 compose 文件会落进同一个 project，各自 `up` 时把对方的容器报为孤儿，加 `--remove-orphans` 会删掉对方的容器。已有部署的迁移步骤见 [Docker Compose 部署](/deploy/compose#升级)。

## 浏览器如何访问 GoTrue

- server 访问 `APP_SUPABASE_URL`，`./scripts/generate-secrets.sh` 写入 `http://supabase-kong:8000`（容器网络内地址）。
- Studio 访问 `VITE_SUPABASE_URL`。生成的 `.env` 中它为空，浏览器端回退到当前站点 origin，请求 `/auth/v1/…` 经入口的 `/auth/` 路由转发到 `supabase-kong:8000`（`agentloom-deploy/nginx.conf`）。因此浏览器只需要能访问入口端口，不需要直接访问 Kong。
- `SUPABASE_KONG_PORT`（默认 8000）把 Kong 映射到宿主所有接口。只走入口时不需要对外开放该端口，可在防火墙上关闭。

`APP_SUPABASE_ANON_KEY`、`APP_SUPABASE_SERVICE_KEY`、`VITE_SUPABASE_ANON_KEY` 是用 `APP_JWT_SECRET` 签名、有效期 5 年的 HS256 JWT（role 分别为 `anon` 与 `service_role`），由 `./scripts/generate-secrets.sh` 生成。更换 `APP_JWT_SECRET` 后要重新生成这三个值，并保持 `SUPABASE_JWT_SECRET` 与 `APP_JWT_SECRET` 相同。

## 公网地址

把以下变量改成实际域名后，依次重建 Supabase 栈与主栈（`docker compose -f docker-compose.supabase.yml up -d`、`docker compose up -d`）：

| 变量 | 作用 | 示例 |
| --- | --- | --- |
| `SUPABASE_SITE_URL` | GoTrue `GOTRUE_SITE_URL`，认证完成后默认跳回的站点 | `https://agentloom.example.com` |
| `SUPABASE_GOTRUE_EXTERNAL_URL` | GoTrue `API_EXTERNAL_URL`；OAuth 回调地址为它加 `/auth/v1/callback` | `https://agentloom.example.com` |
| `SUPABASE_ADDITIONAL_REDIRECT_URLS` | GoTrue `GOTRUE_URI_ALLOW_LIST`，逗号分隔的额外允许跳转地址 | `https://agentloom.example.com/api/v1/auth/oauth/callback` |
| `APP_OAUTH_REDIRECT_URL` | server 发起 OAuth 时传给 GoTrue 的 `redirectTo` | `https://agentloom.example.com/api/v1/auth/oauth/callback` |
| `APP_FRONTEND_URL` | server 生成前端链接用 | `https://agentloom.example.com` |

`SUPABASE_GOTRUE_EXTERNAL_URL` 设为入口域名时，`https://<域名>/auth/v1/callback` 经入口 `/auth/` → Kong `/auth/v1/` → GoTrue `/callback`。

## 启用 Google / GitHub 登录

1. 在 Google Cloud Console 或 GitHub OAuth App 中创建应用，回调 URL 填 `<SUPABASE_GOTRUE_EXTERNAL_URL>/auth/v1/callback`。
2. 在 `agentloom-deploy/` 下的 `.env` 中设置：

   ```dotenv
   SUPABASE_GOOGLE_ENABLED=true
   SUPABASE_GOOGLE_CLIENT_ID=<Google client id>
   SUPABASE_GOOGLE_SECRET=<Google client secret>
   SUPABASE_GITHUB_ENABLED=true
   SUPABASE_GITHUB_CLIENT_ID=<GitHub client id>
   SUPABASE_GITHUB_SECRET=<GitHub client secret>
   ```

3. 重建 GoTrue：

   ```bash
   docker compose -f docker-compose.supabase.yml up -d supabase-auth
   ```

   `docker compose -f docker-compose.supabase.yml ps supabase-auth` 显示 `(healthy)` 即生效。

::: warning 未在本轮验证
「公网地址」与「启用 Google / GitHub 登录」两节没有用真实域名和 OAuth 应用实跑；变量与回调路径取自 `agentloom-deploy/docker-compose.supabase.yml` 与 `agentloom-deploy/supabase/kong.yml`。
:::

## 资源限制

`SUPABASE_AUTH_CPU_LIMIT` / `SUPABASE_AUTH_MEMORY_LIMIT`（默认 `1` / `1G`）、`SUPABASE_KONG_CPU_LIMIT` / `SUPABASE_KONG_MEMORY_LIMIT`（默认 `1` / `1G`）、`SUPABASE_KONG_HEALTHCHECK_TIMEOUT` / `SUPABASE_KONG_HEALTHCHECK_RETRIES` / `SUPABASE_KONG_HEALTHCHECK_START_PERIOD`（默认 `10s` / `10` / `30s`）。完整列表见 [配置参考](/deploy/configuration)。

## 相关

- [配置参考](/deploy/configuration#部署模式与-supabase)：`APP_DEPLOYMENT_MODE` 与 `APP_SUPABASE_*` 的校验规则
- [反向代理](/deploy/reverse-proxy)：`/auth/` 路由
