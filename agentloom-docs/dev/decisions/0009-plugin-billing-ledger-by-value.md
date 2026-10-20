---
docType: explanation
---

# 0009 插件计费账本按值引用插件，新版本就地发布

- 状态：已实施
- 日期：2026-10-20

接口与错误码见 [市场与收益](/api/plugins/marketplace)，实现见 [插件系统](/dev/server/plugins)。本篇只记录为什么这样设计。

## 背景

插件市场采用 copy-on-install：安装方得到自己租户下的插件副本，副本 metadata 里记录源插件（`sourcePluginDbId`）与安装时的价格快照，每次计费执行在安装方租户写一条 `plugin_usage_records`，月结时按 `source_*` 列把收入归给开发者组织。决策时的相关事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | `plugin_usage_records.plugin_db_id`、`plugin_earnings.plugin_db_id` 都是指向 `plugins.id` 的 `ON DELETE CASCADE` 外键 | `agentloom-server/src/database/migrations/` 中两表的建表迁移 |
| F2 | 删除插件不做任何检查：源插件删除会级联删掉 listing、评价、开发者自己的流水与已结算收益；安装方删除副本会删掉该副本全部未结算的计费流水 | `PluginService.remove`；线上验收 C4Plugin D-1、D-2（12 条流水删除前后 12 → 0） |
| F3 | 月结以源插件 id 写 `plugin_earnings.plugin_db_id`；源插件被删后该外键必然违反，同一组织所有插件在一个事务里结算，会一起失败 | `EarningsSettlementWorker.process` |
| F4 | 同一组织内 `plugins (org_id, plugin_id)` 唯一；上传同 ID 新版本返回 409，只能删除重传，新行 id 让 listing 与所有副本的 `sourcePluginDbId` 失效，`upgrade-check` 永远到不了 `upgrade_available` | `plugins.schema.ts` 唯一索引；`MarketplaceService.isSameInstallSource`；线上验收 C4Plugin D-3 |
| F5 | 月结记录在次月 1 日生成，收益接口只读月结记录，开发者看不到已发生的收入 | `PluginEarningsService`；线上验收 C4Plugin D-4 |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 计费流水与插件的关系 | `plugin_usage_records.plugin_db_id` 去掉外键，按值记录执行时的插件记录；RLS 改为只追加（只有 SELECT / INSERT 策略） | **改为可空 + `ON DELETE SET NULL`**：财务记录会被插件删除改写，丢掉「是哪个副本产生的」这一事实；**`RESTRICT`**：安装方永远无法删除用过的插件副本，开发者也无法删除被安装过的插件 |
| 收益记录与插件的关系 | `plugin_earnings.plugin_db_id` 同样去掉外键、按值记录；`(plugin_db_id, period_start, period_end)` 唯一索引保持不变，继续作为结算幂等键 | **SET NULL**：唯一索引上的 null 不再去重，幂等键需要整体换到 `source_plugin_db_id`，迁移面更大且收益不变 |
| 删除源插件 | 仍有 `listed` / `pending_review` 的 listing 时返回 409 `plugin-listed`，要求先下架；已下架的 listing 与评价随插件删除 | **软删除插件**：所有按 `pluginId` 解析插件的路径（执行、路由、市场来源）都要加过滤，范围远超本缺陷；**有任何 listing 都拒绝**：没有删除 listing 的接口，下架后的插件将永远删不掉 |
| 删除安装方副本 | 允许；流水不受影响，月结照常把收入归给开发者 | **改为只能停用**：已有「卸载 = 停用」的入口，再禁止删除只会制造无法清理的记录 |
| 结算失败隔离 | 每个源插件在独立 savepoint 中写入；有插件失败时，事务提交后再抛错让 BullMQ 重试，已结算的插件按幂等键跳过 | **每个插件一个独立事务**：结算需要在来源租户 RLS 上下文中运行，逐个开事务会重复建立租户上下文，savepoint 已足够隔离 |
| 新版本 | `POST /plugins` 遇到同组织同 `pluginId`：市场副本拒绝；版本严格更高（semver）时就地更新同一行，`id` 不变，未带 `status` 时沿用当前状态；同版本或更低仍 409 | **多版本并存（唯一键加上 version）**：执行、路由、市场来源都按 `pluginId` 取「当前」插件，需要引入「当前版本」指针并改造全部解析路径；**删除重传**：即 F4 的现状 |
| 安装方何时看到新版本 | 开发者上传成功即刻可见（源插件需为 active、listing 为 listed），不重新审核 | **新版本需重新审核 listing**：插件 listing 的审核只检查标题、摘要、标签，与产物无关 |
| 未结算收入 | `earnings/summary` 增加 `accruedRevenue`、`accruedDeveloperShare`、`accruedExecutions`，`currentMonthRevenue` 改为本月计费流水合计，均从流水实时聚合；trends / ranking / settlements 仍只含月结记录 | **trends / ranking 也混入流水**：同一图表混合已结算与应计口径，金额与结算记录对不上 |
| 执行版本 | 插件节点总是执行组织内当前版本；检查点记录实际执行的 `pluginVersion`、`pluginContentHash` 与画布记录的版本，不一致时标记并告警 | **按画布版本锁定执行**：同一 ID 只保留一行，旧版本产物在新版本发布后删除，无从执行 |

## 后果

- 插件记录可以随时删除，财务数据不再跟随；`plugin_usage_records` / `plugin_earnings` 中的 `plugin_db_id` 可能指向已不存在的插件，展示名称要回退到 `plugin_id`（ranking 与结算历史已经是 left join）。
- 计费流水不能再通过租户角色更新或删除；需要修正账目时只能追加冲正记录或用运维连接操作。
- 发布新版本会删除旧版本在本租户前缀下的产物。仍引用源租户前缀的历史副本（copy-on-install 之前安装的）会在源发布新版本后无法执行，需升级。
- 插件节点的执行版本可能与画布记录不同，审计以检查点为准。

## 确认方式

- `agentloom-server/test/plugin.e2e-spec.ts`「市场全链路」：上传 1.0.1 后行 id 不变、安装方 `upgrade_available` → `upgrade` → `up_to_date`；同版本重传 409；listed 时删除 409；删除源插件与副本后流水与收益记录仍在；租户角色删除流水不生效；summary 的 `accrued*` 与流水一致。
- `agentloom-server/src/modules/plugin/earnings-settlement.worker.spec.ts`：单个插件写入失败不影响同组织其他插件。
- 迁移 `0091_plugin_ledger_detach.sql`：两条外键与 `plugin_usage_records` 的 UPDATE / DELETE 策略已删除。
