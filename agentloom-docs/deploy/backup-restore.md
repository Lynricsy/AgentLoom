---
docType: howto
---

# 备份与恢复

为 Compose 部署备份 PostgreSQL 与 MinIO、按小时自动执行，并在数据损坏或迁移服务器时恢复。脚本在 `agentloom-deploy/scripts/`，定时器在 `agentloom-deploy/systemd/`。Helm Chart 不包含备份资产。

本页命令在 2026-10-01 对一套运行中的 Compose 部署实跑过（project 名被覆盖为 `docs-verify-deploydocs`，部署目录 `/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy`），输出原样粘贴；systemd 单元未安装验证。

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

产物在 `backups/postgres/`：`agentloom-postgres-<YYYYmmdd-HHMMSS>.dump`、同名 `.sha256`（`sha256sum` 输出，记录的是 dump 的绝对路径）与 `.meta`（创建时间、格式、库名、恢复命令）。dump 写出后脚本用 `POSTGRES_IMAGE` 中的 `pg_restore --list` 校验可读，然后删除 `backups/postgres/` 下修改时间超过 `POSTGRES_BACKUP_RETENTION_DAYS` 天（默认 7）的旧产物。

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
COMPOSE_NETWORK=agentloom-app ./scripts/backup-minio.sh
```

```text
启动 MinIO（若尚未运行）...
 Container docs-verify-deploydocs-minio-1 Running
导出 MinIO bucket agentloom-documents 到 /var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/minio/agentloom-minio-20261001-180300 ...
Added `source` successfully.
`source/agentloom-documents/verify/hello.txt` -> `/backup/agentloom-documents/verify/hello.txt`
┌───────┬─────────────┬──────────┬────────────┐
│ Total │ Transferred │ Duration │ Speed      │
│ 6 B   │ 6 B         │ 00m00s   │ 2.74 KiB/s │
└───────┴─────────────┴──────────┴────────────┘
MinIO 备份完成：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/minio/agentloom-minio-20261001-180300
元数据文件：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/minio/agentloom-minio-20261001-180300/backup.meta
```

产物是目录 `backups/minio/agentloom-minio-<YYYYmmdd-HHMMSS>/`，内含 `<bucket>/` 镜像与 `backup.meta`。超过 `MINIO_BACKUP_RETENTION_DAYS` 天（默认 7）的旧目录被删除。

::: warning 已知问题：MinIO 备份

- **网络名**：脚本用 `docker run --network "${COMPOSE_NETWORK:-agentloom-private}"` 连接 MinIO，而 MinIO 所在网络是 `agentloom-app`。不设置 `COMPOSE_NETWORK` 时失败：

  ```text
  docker: Error response from daemon: failed to set up container networking: network agentloom-private not found
  ```

  因此上面的命令显式传 `COMPOSE_NETWORK=agentloom-app`。`agentloom-deploy/systemd/agentloom-backup-minio.service` 没有设置该变量，安装前在 `ExecStart` 的命令中加上它。`agentloom-deploy/scripts/restore.sh` 的默认值是 `agentloom-app`，两个脚本默认不一致。
- **空 bucket**：bucket 中没有对象时 `mc mirror` 不创建目录，脚本以失败退出，不写 `backup.meta`：

  ```text
  MinIO 备份目录中缺少 bucket 快照：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/minio/agentloom-minio-20261001-180200/agentloom-documents
  ```

  新部署在用户上传第一个文件之前，定时 MinIO 备份会一直失败。
:::

可覆盖的变量：`BACKUP_ROOT`（默认 `agentloom-deploy/` 下的 `backups/minio`）、`TIMESTAMP`、`OUTPUT_DIR`（默认 `$BACKUP_ROOT/agentloom-minio-$TIMESTAMP`）、`METADATA_FILE`、`MINIO_BACKUP_RETENTION_DAYS`、`COMPOSE_NETWORK`、`MC_IMAGE`（`.env` 未设置时脚本内默认 `minio/mc:latest`）。

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

2. 部署目录不是 `/opt/agentloom/agentloom-deploy` 时，编辑两个 service 的 `AGENTLOOM_DEPLOY_DIR`；在 MinIO service 的 `ExecStart` 中加入 `COMPOSE_NETWORK=agentloom-app`（见上方已知问题）。
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

执行顺序：校验 dump 的 `.sha256`（文件存在时）与 `pg_restore --list` 可读性、检查 MinIO 目录中有 `<bucket>/` → 停止 `reverse-proxy`、`studio`、`server`、`worker` → 启动 `postgres` 与 `minio` → 终止库上的连接、`dropdb` 后 `createdb`、`pg_restore --no-owner --no-privileges` → 以 `mc mirror --overwrite --remove` 把备份目录同步回 bucket（备份中没有的对象会被删除）→ 重新启动应用容器 → 检查数据库、server `/api/v1/health` 与入口 `/healthz`。

两个参数都传**绝对路径**：

```bash
./scripts/restore.sh \
  --postgres-dump "$PWD/backups/postgres/agentloom-postgres-20261001-180000.dump" \
  --minio-dir "$PWD/backups/minio/agentloom-minio-20261001-180300"
```

```text
执行恢复前校验...
校验 PostgreSQL dump 校验和：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/postgres/agentloom-postgres-20261001-180000.dump.sha256
校验 PostgreSQL dump 结构可恢复...
停止应用层容器，避免恢复期间产生新写入...
启动 PostgreSQL 与 MinIO ...
 Container docs-verify-deploydocs-postgres-1 Running
 Container docs-verify-deploydocs-minio-1 Running
恢复 PostgreSQL：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/postgres/agentloom-postgres-20261001-180000.dump
恢复 MinIO：/var/tmp/docs-verify-deploydocs/AgentLoom/agentloom-deploy/backups/minio/agentloom-minio-20261001-180300
Added `target` successfully.
Bucket created successfully `target/agentloom-documents`.
`/restore/agentloom-documents/verify/hello.txt` -> `target/agentloom-documents/verify/hello.txt`
┌───────┬─────────────┬──────────┬─────────┐
│ Total │ Transferred │ Duration │ Speed   │
│ 6 B   │ 6 B         │ 00m00s   │ 489 B/s │
└───────┴─────────────┴──────────┴─────────┘
重新启动应用层容器...
执行恢复后烟雾检查...
恢复完成：数据库、对象存储与基础健康检查均已通过。
```

（「重新启动应用层容器」之后的容器启动行已省略。）恢复期间入口不可用，验证时整个过程约 17 秒。

::: warning 已知问题：恢复

- **相对路径**：`--minio-dir` 用相对路径时，脚本在 PostgreSQL **已经被删除重建、应用容器已停止**之后才失败：

  ```text
  docker: Error response from daemon: create backups/minio/agentloom-minio-20261001-180300: "backups/minio/agentloom-minio-20261001-180300" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path
  ```

  失败后用绝对路径重跑整条命令即可恢复。`.sha256` 文件记录的是备份时的绝对路径，把备份拷到其他位置或其他服务器后校验和检查会失败；此时删除或重写 `.sha256` 再恢复。
- **权限丢失**：`pg_restore --no-privileges` 丢弃了 dump 中的全部 `GRANT`（例如 `GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.organizations TO authenticated;`）。脚本自带的健康检查仍然通过，但按租户访问数据的请求返回 500，server 日志为：

  ```text
  cause: PostgresError: permission denied for table organizations
  ```

  恢复完成后，用同一份 dump 只回放权限条目：

  ```bash
  docker compose exec -T postgres sh -lc '
    cat > /tmp/restore.dump &&
    pg_restore --list /tmp/restore.dump | grep " ACL " > /tmp/acl.list &&
    PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" -L /tmp/acl.list /tmp/restore.dump;
    rm -f /tmp/restore.dump /tmp/acl.list
  ' < "$PWD/backups/postgres/agentloom-postgres-20261001-180000.dump"
  ```

  命令无输出、退出码为 0。验证时此前返回 500 的 `GET /api/v1/sandbox-nodes` 随后返回 200。
:::

`restore.sh` 读取的变量：`COMPOSE_FILE`、`ENV_FILE`、`COMPOSE_NETWORK`（默认 `agentloom-app`）、`MC_IMAGE`、`POSTGRES_IMAGE`，以及 `.env` 中的 `APP_MINIO_ENDPOINT`、`APP_MINIO_PORT`、`APP_MINIO_ACCESS_KEY`、`APP_MINIO_SECRET_KEY`、`APP_MINIO_BUCKET`、`APP_MINIO_USE_SSL`。

## 相关

- [部署拓扑](/deploy/#持久化)：命名卷
- [Firecracker 沙箱](/deploy/firecracker)：microVM 磁盘为何不在备份内
