# agentloom_mobile 知识库

## 概览

AgentLoom Flutter 移动端骨架工程，当前实现 Story 7.3：

- Riverpod ProviderScope 启动入口
- GoRouter + `StatefulShellRoute.indexedStack` 三标签导航
- Dio API Client Provider
- dotenv 环境切换（dev / staging / prod）
- Dashboard / Workflows / Settings 占位页面

## 目录约定

```text
lib/
├── app/                 # 应用壳与根 Widget
├── config/              # 环境、主题、常量
├── features/            # 按功能拆分的页面/状态
├── routes/              # go_router 配置与路由名
└── shared/
    ├── models/          # 共享模型（预留）
    ├── providers/       # 全局 Provider
    └── widgets/         # 共享组件（预留）
```

## 命令

执行前先注入 Flutter：

```bash
export PATH="/root/fvm/default/bin:$PATH"
```

```bash
flutter pub get
flutter analyze
dart run build_runner build --delete-conflicting-outputs
flutter test
flutter test --coverage
```

## 当前注意事项

- `envProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入真实环境
- 认证、FCM、深色主题与业务页面均为后续 Story 的 TODO 占位
- `.env.*` 已在 `pubspec.yaml` 声明为 Flutter assets，供 `flutter_dotenv` 加载
