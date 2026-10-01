# agentloom_mobile

AgentLoom 的 Flutter 客户端（移动端为主，兼容桌面与 Web）：认证与 MFA、工作流启动、执行实时监控、Agent 对话、通知与资源管理。Flutter 版本由 FVM 固定（`.fvmrc`）。

## 开发命令

在 `agentloom_mobile/` 内运行：

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # freezed / json_serializable 代码生成
flutter analyze
flutter test
dart run flutter_launcher_icons                            # 重新生成应用图标
flutter run --dart-define=ENV=dev                          # ENV 取 dev|staging|prod，对应 .env.dev/.env.staging/.env.prod
```

## 文档

- 架构、feature 清单、路由与 wire 约定：`agentloom-docs/dev/mobile.md`
- 用户功能说明：`agentloom-docs/guide/mobile/index.md`
