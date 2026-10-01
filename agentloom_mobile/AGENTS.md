# Repository Guidelines

## 概述

Flutter 客户端：Dio 调 REST，Socket.IO 消费执行与对话实时事件；Riverpod 3、GoRouter、Freezed/json_serializable。跨包规则见根 `AGENTS.md`。
架构、feature 清单、路由与 wire 约定：`agentloom-docs/dev/mobile.md`。

## 本包硬规则

- 文件 `snake_case.dart`，类型 PascalCase，变量与 provider lowerCamelCase；遵循邻近代码的 import 分组。
- `analysis_options.yaml` 规则（strict casts/raw types、single quotes、`prefer_final_locals`、`avoid_print` 等）必须通过；生成文件不参与 analyzer。
- Riverpod 用手写 `Notifier` / `AsyncNotifier`，不引入 `riverpod_generator`；参数化状态用 `AsyncNotifierProvider.family`，随路由释放用 `autoDispose.family`。
- family 复合 key 必须是不可变值对象并逐字段实现 `==` 与 `hashCode`。
- notifier 每次 `await` 后、写 `state` 或访问已注册资源前检查 `ref.mounted`；并发请求沿用 request-version 守卫。
- 列表追加页用 `items`/`entries`、`isLoadingMore`、`loadMoreError`；追加失败保留已有数据，首屏失败由 `AsyncValue.error` 表达。
- 屏幕经 provider 读服务端实体，不用 `FutureBuilder` 建第二份缓存；mutation 成功后 invalidate 精确的 list/detail family key。
- DTO 用 `@freezed` + 同名 `.freezed.dart`/`.g.dart` part 与 `fromJson`；改模型后运行 build_runner，生成文件不手改。
- REST JSON 统一经 `normalizeJsonKeys` / `normalizeJsonMap` 递归转 camelCase（同层双键 camelCase 优先）；兼容逻辑放 DTO/API 解码边界。
- 资源响应由 `resource_envelope_decoder.dart` 严格校验，契约违规抛 `ApiContractException`，禁止用空列表/空字符串伪造成功。
- Socket 模型使用 camelCase 字段，禁止 `FieldRename.snake`；REST detail 提供初始 snapshot，Socket 事件推进实时状态。
- 导航统一用 `RouteNames` 与 `goNamed`；新增受保护页面同时处理 router redirect、嵌套位置与路径参数。

## 命令

见本包 `README.md`。

## 改动时更新

新 feature → 仓库根 `pnpm docs:gen` 并更新 `agentloom-docs/dev/mobile.md`；用户可见功能 → `agentloom-docs/guide/mobile/`。
