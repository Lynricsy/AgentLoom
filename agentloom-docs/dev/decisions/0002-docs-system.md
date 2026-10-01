---
docType: explanation
---

# 0002 文档体系：单站、Diátaxis、生成式参考

- 状态：已实施
- 日期：2026-10-01

维护规则见 [文档维护指南](/dev/docs-maintenance)。本篇记录为什么采用这套体系。

## 背景

重构前的文档无法让新同事或新代理了解并回顾这个系统：

- **两个站点，一个没有部署。** 开发者站 `agentloom-docs` 与用户站 `agentloom-user-docs` 共用 base `/documentation/`，但部署镜像只构建用户站；开发者站的 `public/openapi.json` 被 git 忽略且没有 `predev` 同步，干净检出后无法启动。用户站镜像没有复制 server 的 OpenAPI 文件，同步脚本退回空 stub，线上 API 页为空。
- **清单手写且普遍过时。** 文档中的 server 模块数、队列数、数据表数、节点类型数、端口数据类型数、内置技能数、Studio feature 数与源码都对不上；有虚构的节点页（`text-input`，真实类型为 `text`）、已删除的表、不存在的 WASM 导出、错误的健康检查路径与环境变量名。
- **入口层重复。** 根 `CLAUDE.md` 是 `AGENTS.md` 的过时副本；开发命令在根 README、各包 README、各包 AGENTS.md 中重复出现并互相矛盾；`docs/design/` 下的 Agent 对外 API 设计稿标为"草案"但已全部实现，且无人引用。
- **页面类型混杂。** 同一页里既有教程步骤、又有参考表格和设计解释，读者找不到想要的部分，作者也不知道新内容该放哪里。
- 英文站只有占位页。

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 站点形态 | 合并为一个 VitePress 站，保留 `agentloom-docs` 目录，分 `guide/`、`api/`、`deploy/`、`dev/` 四个分区；删除 `agentloom-user-docs` 与根 `docs` 目录 | **保留两站**：两套配置、两套构建、链接互跳，正是开发者站长期未部署的原因 |
| 语言 | 仅中文，关闭 locale，路径不带 `/zh/` | **保留英文占位**：没有译者，占位页只会让读者落到空页 |
| 页面组织 | Diátaxis：每页只属于教程、操作指南、参考、解释之一，frontmatter `docType` 标明 | **按包或模块组织**：同一页会继续混合四类内容 |
| 清单类事实 | 由 `scripts/docs-reference/generate.ts` 从源码生成到 `agentloom-docs/_generated/`，页面 include；`pnpm docs:check` 检查生成产物、路径、环境变量名、节点页覆盖、仓库地图，并入提交前门禁 | **手写清单 + 定期审计**：本次审计显示手写清单在几个月内全部过时；审计依赖人记得做 |
| AGENTS.md | 压缩为规则、门禁与文档路由表，事实移到文档站；删除 `CLAUDE.md` | **AGENTS.md 承载事实**：它被每个代理全量读入，事实一多就过时且挤占上下文；Claude Code 已原生读取 AGENTS.md |
| 命令 | 只写在根与各包 `README.md` | **文档站另写一份命令**：两处必然分叉 |
| 变更记录 | 不建 whats-new 与 CHANGELOG | 仓库仅开发环境、无发布版本，变更记录的读者不存在；历史由 git 与 `.agent-logs` 承担 |
| 决策记录 | 新建 `dev/decisions/`，ADR 从 0001 编号；原设计稿改写为 ADR 0001 | **继续用 `docs/design/` 设计稿**：设计稿描述"打算怎么做"，实施后无人更新状态 |
| 截图 | 本轮纯文字，UI 文案对齐 Studio 源码中的真实字样 | **截图**：无法被 `docs:check` 校验，UI 一改即过时 |

## 后果

- 新增模块、队列、表、环境变量、节点类型、Socket 事件、路由时，作者必须运行 `pnpm docs:gen` 并提交 `_generated/`，否则 `pnpm docs:check` 失败；对应的操作步骤写在 `dev/howto/` 下。
- 页面中不能出现计数；需要列举时只能 include 生成文件。
- 页面中反引号包裹的仓库路径与环境变量名都会被检查，示例名必须写在代码块中或不加反引号。
- 文档镜像从 `agentloom-docs/` 构建并复制 server 的 OpenAPI 文件；OpenAPI 缺失时同步脚本直接失败，不再生成空页面。
- 英文读者没有文档。
- AGENTS.md 变短后，代理需要按路由表再读文档页，多一次跳转。

## 确认方式

在仓库根：

```bash
pnpm docs:check
```

五项检查全部通过时退出码为 0。另外：`agentloom-user-docs`、根 `docs` 目录、`CLAUDE.md` 不存在；`cd agentloom-docs && pnpm build` 在 `ignoreDeadLinks: false` 下通过；`docker build -f agentloom-deploy/docker/docs.Dockerfile .` 产出的镜像在 `/documentation/` 提供站点与非空的 OpenAPI。
