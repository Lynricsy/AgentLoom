# 快速开始

本页将引导你在本地搭建 AgentLoom 开发环境，从零启动服务端与前端工作台。

## 环境要求

在开始之前，请确保你的开发机器已安装以下工具：

| 工具           | 最低版本 | 说明                             |
| -------------- | -------- | -------------------------------- |
| **Node.js**    | 20+      | 推荐使用 LTS 版本                |
| **pnpm**       | 9+       | 各子包独立管理依赖               |
| **Docker**     | 24+      | 用于运行 Qdrant 等基础设施       |
| **PostgreSQL** | 15+      | 主数据库（或使用 Supabase 托管） |
| **Redis**      | 7+       | BullMQ 消息队列                  |

**可选工具：**

| 工具                     | 用途               |
| ------------------------ | ------------------ |
| **Rust + wasm-pack**     | 修改类型引擎时需要 |
| **Flutter 3.41.2 (FVM)** | 移动端开发         |

## 克隆项目

```bash
git clone <your-repo-url> agentloom
cd agentloom
```

::: tip 项目结构
AgentLoom 是**非标准 monorepo**，各子包独立管理 `package.json` 和 lockfile，无 pnpm-workspace.yaml。你需要分别进入各子包安装依赖。
:::

## 启动基础设施

项目提供了 `docker-compose.dev.yml`，包含 Qdrant 向量数据库。PostgreSQL、Redis、MinIO 需要自行部署或使用云服务。

```bash
# 启动 Qdrant
docker compose -f docker-compose.dev.yml up -d
```

确保以下服务可访问：

| 服务       | 默认地址         | 说明                     |
| ---------- | ---------------- | ------------------------ |
| PostgreSQL | `localhost:5432` | 可使用 Supabase 托管实例 |
| Redis      | `localhost:6379` | BullMQ 队列              |
| Qdrant     | `localhost:6333` | 向量检索                 |
| MinIO      | `localhost:9000` | 对象存储                 |

## 配置服务端

### 1. 安装服务端依赖

```bash
cd agentloom-server
pnpm install
```

### 2. 配置服务端环境变量

复制环境变量模板并编辑：

```bash
cp .env.example .env
```

以下是关键配置项：

```bash
# 基础配置
APP_PORT=3000
APP_NODE_ENV=development

# 数据库连接
APP_DATABASE_URL=postgresql://user:password@localhost:5432/agentloom

# Supabase（认证服务）
APP_SUPABASE_URL=https://your-project.supabase.co
APP_SUPABASE_ANON_KEY=your-anon-key
APP_SUPABASE_SERVICE_KEY=your-service-key

# JWT 密钥
APP_JWT_SECRET=your-jwt-secret

# Redis
APP_REDIS_URL=redis://localhost:6379

# 加密主密钥（256-bit Base64）
APP_MASTER_ENCRYPTION_KEY=  # 使用 openssl rand -base64 32 生成

# 前端地址（CORS 白名单）
APP_FRONTEND_URL=http://localhost:5173

# MinIO 对象存储
APP_MINIO_ENDPOINT=localhost
APP_MINIO_PORT=9000
APP_MINIO_ACCESS_KEY=minioadmin
APP_MINIO_SECRET_KEY=minioadmin
APP_MINIO_USE_SSL=false
APP_MINIO_BUCKET=agentloom

# Qdrant 向量数据库
APP_QDRANT_URL=http://localhost:6333
```

::: warning 安全提示
`APP_MASTER_ENCRYPTION_KEY` 用于 E2EE 体系的主密钥派生，务必使用强随机值并妥善保管。
:::

### 3. 初始化服务端数据库

```bash
# 生成 Drizzle 迁移文件
pnpm db:generate

# 执行迁移
pnpm db:migrate

# （可选）填充种子数据，包含 5 个预置工作流模板
pnpm db:seed
```

### 4. 启动服务端开发服务器

```bash
pnpm start:dev
```

服务端将在 `http://localhost:3000` 启动（watch mode 自动重载）。

## 配置前端工作台

### 1. 安装前端依赖

```bash
cd agentloom-studio
pnpm install
```

### 2. 配置前端环境变量

```bash
cp .env.example .env
```

关键配置：

```bash
# API 基础路径
VITE_API_BASE_URL=/api/v1

# 自动保存防抖间隔（毫秒）
VITE_AUTOSAVE_DEBOUNCE_MS=500

# Supabase（与服务端使用同一项目）
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 启动前端开发服务器

```bash
pnpm dev
```

前端工作台将在 `http://localhost:5173` 启动。在浏览器中打开即可看到 AgentLoom Studio 画布编辑器。

## 验证安装

当服务端和前端都成功启动后，你可以：

1. 访问 `http://localhost:5173` 打开 Studio 工作台
2. 访问 `http://localhost:3000/api/health` 验证服务端健康状态
3. 使用 Drizzle Studio 查看数据库：`pnpm db:studio`（在 agentloom-server 目录下）

## 常用开发命令

### 服务端

```bash
cd agentloom-server
pnpm start:dev          # 开发模式（watch）
pnpm test               # 单元测试
pnpm test:e2e           # E2E 测试（需 Docker）
pnpm test:cov           # 覆盖率报告（80% 阈值）
pnpm db:generate        # 生成迁移文件
pnpm db:migrate         # 执行迁移
pnpm db:seed            # 填充种子数据
pnpm db:studio          # Drizzle Studio
pnpm openapi:export     # 导出 OpenAPI 3.0 规范
```

### 前端工作台

```bash
cd agentloom-studio
pnpm dev                # 开发模式
pnpm test               # 单元测试
pnpm typecheck          # TypeScript 类型检查
pnpm build              # 生产构建
```

### 类型引擎（需 Rust 工具链）

```bash
cd agentloom-type-engine
cargo test              # 运行测试
cargo bench             # 性能基准测试
wasm-pack build --target bundler --release  # 构建 WASM 产物
```

### 移动端（需 Flutter 3.41.2）

```bash
cd agentloom_mobile
flutter pub get         # 安装依赖
flutter analyze         # 静态分析
flutter test            # 单元测试
dart run build_runner build  # 代码生成
```

## 下一步

环境搭建完成后，建议继续阅读：

- [架构总览](/zh/guide/architecture) — 了解各子系统如何协作
- [核心概念](/zh/guide/concepts) — 掌握工作流、节点、端口等关键概念
- [服务端架构](/zh/server/) — 深入了解后端模块设计
- [工作室前端](/zh/studio/) — 探索画布编辑器实现
