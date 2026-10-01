---
docType: reference
---

# 市场与收益

已注册的插件默认只在本组织可用。上架到插件市场后其他组织可以安装；按次计费的插件被调用时记录用量，平台每月结算开发者收益。本页列出上架与收益相关的接口和规则。服务端如何执行插件、记录用量见 [服务端插件系统](/dev/server/plugins)。

## 上架接口

前缀 `/api/v1/plugins/marketplace`，凭证见 [API 约定](/api/#凭证)。

| 方法与路径 | 角色 | 说明 |
| --- | --- | --- |
| `POST /listings` | owner、admin、creator | 提交上架，立即自动审核 |
| `GET /listings` | 全部角色 | 本组织的插件上架记录；查询参数 `status`、`pricingModel`、`page`、`pageSize` |
| `GET /listings/:id` | 全部角色 | 单条记录 |
| `PATCH /listings/:id` | owner、admin、creator | 修改上架信息（字段同提交，全部可选） |
| `POST /listings/:id/unlist` | owner、admin、creator | 下架 |
| `POST /listings/:id/relist` | owner、admin、creator | 重新上架 |

提交请求体：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `pluginDbId` | 是 | 插件记录的 `id`（`GET /api/v1/plugins` 返回的 UUID，不是清单里的插件 ID） |
| `title` | 是 | 5–120 字符 |
| `summary` | 是 | 30–500 字符 |
| `tags` | 是 | 1–8 个，每个 ≤32 字符 |
| `category` | 否 | `analysis`、`content`、`development`、`automation`、`reporting` |
| `pricingModel` | 是 | `free` 或 `per_execution` |
| `pricePerExecution` | `per_execution` 时必填 | 非负数字字符串，最多 8 位小数 |

上架状态：`pending_review`、`review_failed`、`listed`、`unlisted`。已是 `listed` 或 `pending_review` 的插件不能重复提交。

```bash
curl -s "$AGENTLOOM_API/plugins/marketplace/listings" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"pluginDbId":"<插件记录 id>","title":"文本前缀工具","summary":"为工作流中的任意文本加上可配置的前缀，适合在消息模板与报告标题里统一加标记。","category":"content","tags":["text"],"pricingModel":"per_execution","pricePerExecution":"0.002"}' \
  | jq '{status: .data.status, pricePerExecution: .data.pricePerExecution, reviewResult}'
```

```json
{
  "status": "listed",
  "pricePerExecution": "0.00200000",
  "reviewResult": {
    "outcome": "passed",
    "checks": [
      { "code": "TITLE_INVALID", "status": "passed", "message": "标题格式正确" },
      { "code": "SUMMARY_INVALID", "status": "passed", "message": "摘要格式正确" },
      { "code": "TAGS_INVALID", "status": "passed", "message": "标签格式正确" }
    ],
    "reviewedAt": "2026-10-01T09:58:58.657Z"
  }
}
```

（输出来自本地实跑，`jq` 的缩进为便于阅读做了合并。）

## 插件包限制

- `.alp` 文件不超过 50 MB，超出返回 413 `plugin-file-too-large`。
- 归档必须经过签名并通过 WASM 检查，见 [开发教程](/api/plugins/tutorial#出错时)。

## 分成

每个结算周期按插件汇总收入后计算：

| 项 | 计算 |
| --- | --- |
| 开发者毛收入 | 总收入 × 70% |
| 上架佣金 | 开发者毛收入 × 15% |
| 开发者净收入 | 开发者毛收入 − 上架佣金（= 总收入 × 59.5%） |
| 平台份额 | 总收入 × 30% |

例如一个周期收入 1000：开发者毛收入 700，佣金 105，开发者净收入 595，平台份额 300。金额以 8 位小数定点计算，币种默认 `USD`。

## 结算

- 每月 1 日 03:00 UTC（cron `0 3 1 * *`）派发上一个自然月的结算任务。
- 同一插件同一周期只结算一次。
- 结算记录的打款状态：`pending` → `processing` → `completed` 或 `failed`。

## 收益接口

前缀同上，角色 owner、admin。在 Studio 中对应侧边栏「开发者」的收益页（`/developer-console/earnings`），操作见 [开发者控制台](/guide/collaboration/developer-console)。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /earnings/summary` | 汇总：总收入、本月收入、执行次数、启用插件数、开发者份额、待打款与已打款 |
| `GET /earnings/trends` | 月度趋势 |
| `GET /earnings/ranking` | 插件收入排行，`limit` 默认 10、最大 100 |
| `GET /earnings/settlements` | 结算记录 |
| `GET /earnings/history` | 收益明细，分页 |
| `PATCH /earnings/:id/payout-status` | 更新打款状态 |

收益接口直接返回结果对象，没有 `data` 外层：

```bash
curl -s "$AGENTLOOM_API/plugins/marketplace/earnings/summary" -H "Authorization: Bearer $JWT"
```

```json
{"totalRevenue":"0.00000000","currentMonthRevenue":"0.00000000","totalExecutions":0,"activePlugins":0,"totalDeveloperShare":"0.00000000","pendingPayout":"0.00000000","completedPayout":"0.00000000"}
```
