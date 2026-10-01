---
docType: howto
---

# 备份与恢复

为 Compose 部署备份 PostgreSQL 与 MinIO、按小时自动执行，并在数据损坏或迁移服务器时恢复。脚本在 `agentloom-deploy/scripts/`，定时器在 `agentloom-deploy/systemd/`。Helm Chart 不包含备份资产。

本页命令在 2026-10-01 对一套运行中的 Compose 部署实跑过（「备份 PostgreSQL」一节的输出来自 project `docs-verify-deploydocs`、部署目录 `/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy`；「备份 MinIO」与「恢复」两节的输出来自 project `fixlab-deploy`、部署目录 `/root/Projects/Ling/fixlab-deploy/agentloom-deploy`），输出原样粘贴；systemd 单元未安装验证。

## 备份范围

| 数据 | 是否备份 | 方式 |
| --- | --- | --- |
| PostgreSQL 整库（含 GoTrue 的 `auth` schema） | 是 | `./scripts/backup-postgres.sh`，`pg_dump -Fc` |
| MinIO bucket（`APP_MINIO_BUCKET`，默认 `agentloom-documents`） | 是 | `./scripts/backup-minio.sh`，`mc mirror --overwrite` |
| Redis（队列与缓存） | 否 | — |
| Qdrant 向量 | 否 | — |
| `firecracker_state` 卷中的 microVM 磁盘 | 否 | 持久沙箱的内容应写入 Workspace snapshot；runtime 状态只能在 manager 停止后做块级快照 |
| `agentloom-deploy/` 下的 `.env` 与 Firecracker PKI | 否 | 自行离线保存；丢失后数据库中加密字段无法解密（`APP_MASTER_ENCRYPTION_KEY`） |

## 前置条件

- 在 `agentloom-deploy/` 下执行；脚本读取 `.env`（可用 `ENV_FILE` 指定）与 `docker-compose.yml`（可用 `COMPOSE_FILE` 指定）。
- 主栈已按 [Docker Compose 部署](/deploy/compose) 运行。备份脚本会先 `docker compose up -d postgres` 或 `minio`，不会启动其他服务。
- 宿主能拉取 `POSTGRES_IMAGE`（校验 dump）与 `MC_IMAGE`（MinIO 客户端）。

## 备份 PostgreSQL

```bash
./scripts/backup-postgres.sh
```

```text
启动 PostgreSQL（若尚未运行）...
 Container docs-verify-deploydocs-postgres-1 Running
导出 PostgreSQL 归档到 /var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/postgres/agentloom-postgres-20261001-180000.dump ...
校验 PostgreSQL 归档可被 pg_restore 读取...
PostgreSQL 备份完成：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/postgres/agentloom-postgres-20261001-180000.dump
校验和文件：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/postgres/agentloom-postgres-20261001-180000.dump.sha256
元数据文件：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/postgres/agentloom-postgres-20261001-180000.dump.meta
```

产物在 `backups/postgres/`：`agentloom-postgres-<YYYYmmdd-HHMMSS>.dump`、同名 `.sha256`（只记录文件名，整个备份目录搬到别处后仍可校验）与 `.meta`（创建时间、格式、库名、恢复命令）。dump 写出后脚本用 `POSTGRES_IMAGE` 中的 `pg_restore --list` 校验可读，然后删除 `backups/postgres/` 下修改时间超过 `POSTGRES_BACKUP_RETENTION_DAYS` 天（默认 7）的旧产物。

可覆盖的变量：

| 变量 | 默认 |
| --- | --- |
| `BACKUP_ROOT` | `agentloom-deploy/` 下的 `backups/postgres` |
| `TIMESTAMP` | `date +%Y%m%d-%H%M%S` |
| `OUTPUT_FILE` | `$BACKUP_ROOT/agentloom-postgres-$TIMESTAMP.dump` |
| `CHECKSUM_FILE` / `METADATA_FILE` | `$OUTPUT_FILE.sha256` / `$OUTPUT_FILE.meta` |
| `POSTGRES_BACKUP_RETENTION_DAYS` | `7`；非整数时跳过清理并打印提示 |
| `POSTGRES_IMAGE` | `postgres:16-alpine` |

## 备份 MinIO

```bash
./scripts/backup-minio.sh
```

```text
启动 MinIO（若尚未运行）...
导出 MinIO bucket agentloom-documents 到 /root/Projects/Ling/fixlab-deploy/agentloom-deploy/backups/minio/agentloom-minio-t1 ...
Added `source` successfully.
`source/agentloom-documents/verify/hello.txt` -> `/backup/agentloom-documents/verify/hello.txt`
┌───────┬─────────────┬──────────┬────────────┐
│ Total │ Transferred │ Duration │ Speed      │
│ 6 B   │ 6 B         │ 00m00s   │ 2.33 KiB/s │
└───────┴─────────────┴──────────┴────────────┘
MinIO 备份完成：/root/Projects/Ling/fixlab-deploy/agentloom-deploy/backups/minio/agentloom-minio-t1
元数据文件：/root/Projects/Ling/fixlab-deploy/agentloom-deploy/backups/minio/agentloom-minio-t1/backup.meta
```

（验证时用 `TIMESTAMP=t1` 固定了目录名，省略了 `Container … Running/Healthy` 行。）

产物是目录 `backups/minio/agentloom-minio-<YYYYmmdd-HHMMSS>/`，内含 `<bucket>/` 镜像与 `backup.meta`。超过 `MINIO_BACKUP_RETENTION_DAYS` 天（默认 7）的旧目录被删除。

脚本用 `docker run --network <AGENTLOOM_NETWORK_PREFIX>-app`（默认 `agentloom-app`，即 MinIO 所在的 `app_net`）运行 `mc`。bucket 不存在时 `mc ls` 失败并退出；bucket 为空时得到一个空的 `<bucket>/` 目录，备份照常完成（新部署在第一个文件上传之前的定时备份不会失败）。

可覆盖的变量：`BACKUP_ROOT`（默认 `agentloom-deploy/` 下的 `backups/minio`）、`TIMESTAMP`、`OUTPUT_DIR`（默认 `$BACKUP_ROOT/agentloom-minio-$TIMESTAMP`，相对路径会被转换为绝对路径）、`METADATA_FILE`、`MINIO_BACKUP_RETENTION_DAYS`、`COMPOSE_NETWORK`（默认 `<AGENTLOOM_NETWORK_PREFIX>-app`）、`MC_IMAGE`（`.env` 未设置时脚本内默认 `pgsty/mc:RELEASE.2026-09-16T00-00-00Z`）。

## 安装定时备份

`agentloom-deploy/systemd/` 提供两对 oneshot service 与 timer：

| 单元 | 执行 | `OnCalendar` |
| --- | --- | --- |
| `agentloom-backup-postgres.service` / `.timer` | `agentloom-deploy/scripts/backup-postgres.sh` | `*-*-* *:05:00`（每小时第 5 分钟） |
| `agentloom-backup-minio.service` / `.timer` | `agentloom-deploy/scripts/backup-minio.sh` | `*-*-* *:20:00`（每小时第 20 分钟） |

两个 timer 都是 `Persistent=true`（关机期间错过的执行在开机后补跑）、`AccuracySec=1m`。service 通过 `Environment=AGENTLOOM_DEPLOY_DIR=/opt/agentloom/agentloom-deploy` 定位部署目录，并把 `ENV_FILE`、`COMPOSE_FILE` 指向该目录。

1. 复制单元文件：

   ```bash
   sudo cp systemd/agentloom-backup-*.service systemd/agentloom-backup-*.timer /etc/systemd/system/
   ```

2. 部署目录不是 `/opt/agentloom/agentloom-deploy` 时，编辑两个 service 的 `AGENTLOOM_DEPLOY_DIR`。
3. 启用：

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now agentloom-backup-postgres.timer agentloom-backup-minio.timer
   systemctl list-timers 'agentloom-backup-*'
   ```

   `list-timers` 列出两个 timer 及下次执行时间即安装成功。

::: warning 未在本轮验证
「安装定时备份」一节没有在验证宿主上安装执行，内容取自 `agentloom-deploy/systemd/` 的单元文件。
:::

## 恢复

`./scripts/restore.sh` 用一份 PostgreSQL dump 与一份 MinIO 备份目录覆盖当前数据。两个参数都必填，缺任一个时打印用法并退出：

```text
用法：./scripts/restore.sh --postgres-dump <dump-file> --minio-dir <backup-dir>
```

执行顺序：

1. 把两个参数转换为绝对路径；校验 dump 的 `.sha256`（文件存在时，只比较哈希值）与 `pg_restore --list` 可读性；检查 MinIO 目录中有 `<bucket>/`。
2. 启动 `postgres` 与 `minio`，用正式恢复相同的网络、`MC_IMAGE` 与挂载运行一次 `mc` 探测。网络、镜像或挂载任一不可用时在这里失败退出，数据库与应用容器都未被改动。
3. 停止 `reverse-proxy`、`studio`、`server`、`worker`。
4. 终止库上的连接，`dropdb` 后 `createdb`；确保 Supabase 兼容角色（`supabase_auth_admin`、`authenticated`、`anon`、`service_role`、`postgres`）存在并补上数据库级授权；`pg_restore --exit-on-error --single-transaction` 原样恢复属主与 `GRANT`（server 的按租户请求以 `authenticated` 角色访问表，依赖这些授权）。
5. 以 `mc mirror --overwrite --remove` 把备份目录同步回 bucket（备份中没有的对象会被删除）。
6. `docker compose up -d --wait` 重新启动应用容器，检查数据库、server `/api/v1/health` 与入口 `/healthz`。

```bash
./scripts/restore.sh \
  --postgres-dump backups/postgres/agentloom-postgres-t1.dump \
  --minio-dir backups/minio/agentloom-minio-t1
```

```text
执行恢复前校验...
校验 PostgreSQL dump 校验和：/root/Projects/Ling/fixlab-deploy/agentloom-deploy/backups/postgres/agentloom-postgres-t1.dump.sha256
校验 PostgreSQL dump 结构可恢复...
启动 PostgreSQL 与 MinIO ...
停止应用层容器，避免恢复期间产生新写入...
恢复 PostgreSQL：/root/Projects/Ling/fixlab-deploy/agentloom-deploy/backups/postgres/agentloom-postgres-t1.dump
恢复 MinIO：/root/Projects/Ling/fixlab-deploy/agentloom-deploy/backups/minio/agentloom-minio-t1
Bucket created successfully `target/agentloom-documents`.
┌───────┬─────────────┬──────────┬───────┐
│ Total │ Transferred │ Duration │ Speed │
│ 0 B   │ 0 B         │ 00m00s   │ 0 B/s │
└───────┴─────────────┴──────────┴───────┘
重新启动应用层容器...
执行恢复后烟雾检查...
恢复完成：数据库、对象存储与基础健康检查均已通过。
```

（省略了 `Container …` 行；bucket 中的对象与备份一致，所以 `mc mirror` 传输量为 0。）恢复后用同一账号登录并请求按租户访问的接口：`GET /api/v1/organizations/current`、`/api/v1/sandbox-nodes`、`/api/v1/agent-definitions` 均返回 200，`has_table_privilege('authenticated','organizations','SELECT')` 为 `t`。

恢复会终止 GoTrue 持有的数据库连接，恢复完成后的**第一次**登录可能返回 500（GoTrue 日志 `terminating connection due to administrator command (SQLSTATE 57P01)`），重试即成功。

把 `COMPOSE_NETWORK` 设成不存在的网络时，脚本在第 2 步退出（`MinIO 未在预期时间内就绪（网络 fixlab-deploy-nonexist，…）`），`organizations` 表中的数据保持不变。

`restore.sh` 读取的变量：`COMPOSE_FILE`、`ENV_FILE`、`COMPOSE_NETWORK`（默认 `<AGENTLOOM_NETWORK_PREFIX>-app`）、`MC_IMAGE`、`POSTGRES_IMAGE`，以及 `.env` 中的 `APP_MINIO_ENDPOINT`、`APP_MINIO_PORT`、`APP_MINIO_ACCESS_KEY`、`APP_MINIO_SECRET_KEY`、`APP_MINIO_BUCKET`、`APP_MINIO_USE_SSL`。

## 相关

- [部署拓扑](/deploy/#持久化)：命名卷
- [Firecracker 沙箱](/deploy/firecracker)：microVM 磁盘为何不在备份内
