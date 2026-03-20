# 开发指南

## 前置要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Flutter | 3.41.2 | 通过 FVM 管理，项目已固定版本 |
| FVM | 最新 | Flutter 版本管理器 |
| Dart | ≥ 3.11.0 | 随 Flutter SDK 附带 |
| Android Studio / Xcode | 最新 | 原生平台编译环境 |
| agentloom-server | 运行中 | 后端 API 服务 |

### 安装 FVM

如果你还没有安装 FVM：

```bash
dart pub global activate fvm
```

项目根目录下已有 `.fvmrc` 配置文件，FVM 会自动选择 Flutter 3.41.2。

## 环境搭建

### 1. 克隆项目并进入移动端目录

```bash
cd agentloom_mobile
```

### 2. 安装 Flutter SDK（首次）

```bash
fvm install
```

FVM 会自动下载 Flutter 3.41.2 版本。

### 3. 安装依赖

```bash
fvm flutter pub get
```

### 4. 配置环境变量

项目包含三套环境文件，已提交到 git：

| 文件 | API 地址 | 用途 |
|------|---------|------|
| `.env.dev` | `https://api-dev.agentloom.com/api/v1` | 开发环境 |
| `.env.staging` | staging 环境 API | 预发布环境 |
| `.env.prod` | 生产环境 API | 正式环境 |

环境文件在 `pubspec.yaml` 中声明为 Flutter assets，由 `flutter_dotenv` 在运行时加载。如需修改 API 地址，直接编辑对应的 `.env.*` 文件。

### 5. 生成代码（Freezed / JSON Serializable）

项目使用 Freezed 3.x 生成不可变模型和 JSON 序列化代码：

```bash
fvm dart run build_runner build --delete-conflicting-outputs
```

::: tip 生成文件已提交
`.freezed.dart` 和 `.g.dart` 文件已提交到 git，通常情况下不需要重新生成。只有在修改了 `@freezed` 注解的模型类后才需要执行此命令。
:::

## 运行应用

### 开发环境（默认）

```bash
fvm flutter run
```

未指定 `ENV` 时默认使用 `.env.dev`。

### 指定环境运行

```bash
# 使用 staging 环境
fvm flutter run --dart-define=ENV=staging

# 使用 production 环境
fvm flutter run --dart-define=ENV=prod
```

### 指定目标设备

```bash
# 列出可用设备
fvm flutter devices

# 指定 iOS 模拟器
fvm flutter run -d "iPhone 16"

# 指定 Android 模拟器
fvm flutter run -d emulator-5554
```

## Firebase 配置（可选）

推送通知功能需要 Firebase 配置文件：

- **Android:** `android/app/google-services.json`
- **iOS:** `ios/Runner/GoogleService-Info.plist`

::: warning 优雅降级
这两个文件未提交到 git。应用在没有 Firebase 配置的情况下仍可正常运行，推送功能会自动跳过。开发时不配置 Firebase 不会影响其他功能。
:::

## 测试

### 运行全部测试

```bash
fvm flutter test
```

当前共 **429 个测试**，覆盖以下模块：

- models / api / providers / widgets / screens
- routes / auth / execution / dashboard
- workflow-run / parameter-input / notifications

### 运行单个测试文件

```bash
fvm flutter test test/features/auth/providers/auth_notifier_test.dart
```

### 覆盖率报告

```bash
fvm flutter test --coverage
```

生成的覆盖率报告位于 `coverage/lcov.info`。

### 测试模式说明

| 模式 | 用法 |
|------|------|
| Mock 框架 | `mocktail` |
| 测试工厂 | 集中在 `test/helpers/test_helpers.dart` |
| Provider 测试 | `container.listen()` + `Completer<void>` 避免 dispose StateError |
| Widget 测试 | `UncontrolledProviderScope` + `ProviderContainer` |

## 静态分析

```bash
fvm flutter analyze
```

项目使用 `flutter_lints` 规则集，确保代码风格统一。

## 常用命令速查

```bash
# 安装依赖
fvm flutter pub get

# 静态分析
fvm flutter analyze

# 代码生成（Freezed / json_serializable）
fvm dart run build_runner build --delete-conflicting-outputs

# 运行测试
fvm flutter test

# 覆盖率
fvm flutter test --coverage

# 运行应用（dev 环境）
fvm flutter run

# 运行应用（指定环境）
fvm flutter run --dart-define=ENV=staging
```

## 项目约定

### Provider 编写

- 使用手写 Provider，不使用 `riverpod_generator`
- 异步操作后必须检查 `ref.mounted`

```dart
Future<void> fetchData() async {
  state = const AsyncLoading();
  final result = await api.getData();
  if (!ref.mounted) return; // 必须检查
  state = AsyncData(result);
}
```

### 模型定义

- 使用 Freezed 3.x，`@JsonKey(name: 'snake_case')` 处理命名转换
- 复杂 equality 场景（如 `InputFieldDefinition`）手写模型

### API 调用

- 通过对应 feature 的 Api 类封装 Dio 调用
- 方法签名与服务端 REST 端点一一对应
- AuthApi 使用独立 Dio 实例（`authDioProvider`），避免 AuthInterceptor 循环依赖

### 状态建模

- 核心状态使用 sealed class，而非 plain AsyncValue
- Widget 中使用 `.when()` 前检查 `hasError && !hasValue`，兼容 Riverpod 3.x 中间状态

## 后端依赖

移动端依赖 `agentloom-server` 提供的以下服务：

| 服务 | 端点/协议 | 用途 |
|------|----------|------|
| REST API | `GET/POST /api/v1/*` | 认证、工作流、执行等 CRUD |
| Socket.IO | `/execution` namespace | 执行状态实时推送 |
| FCM | Firebase Admin SDK | 推送通知 |

确保后端服务已启动，且 `.env.*` 中的 `API_BASE_URL` 配置正确。

::: tip 快速启动后端
```bash
cd agentloom-server
pnpm install && pnpm start:dev
```
参考 [服务端文档](/zh/server/) 了解完整的后端配置。
:::
