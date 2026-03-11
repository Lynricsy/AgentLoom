# agentloom_mobile

AgentLoom Flutter 移动端骨架工程，覆盖 Story 7.3 的基础设施：环境配置、Riverpod、GoRouter、Dio Provider、Material 3 主题与占位页面。

## 开发命令

执行 Flutter 命令前请先注入 SDK 路径：

```bash
export PATH="/root/fvm/default/bin:$PATH"
```

常用命令：

```bash
flutter pub get
flutter analyze
dart run build_runner build --delete-conflicting-outputs
flutter test
flutter test --coverage
```

## 目录概览

```text
lib/
├── app/
├── config/
├── features/
│   ├── dashboard/
│   ├── settings/
│   └── workflows/
├── routes/
└── shared/
    ├── models/
    ├── providers/
    └── widgets/
```

## 环境文件

- `.env.dev`
- `.env.staging`
- `.env.prod`

默认通过 `--dart-define=ENV=<dev|staging|prod>` 选择环境，未传时回退到 `dev`。
