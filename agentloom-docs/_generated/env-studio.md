<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-studio/.env.example`（Vite 构建期变量；生产镜像在容器启动时替换 `__VITE_*__` 占位符）。

| 变量 | 模板值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | API 基础 URL（开发环境由 Vite proxy 代理，生产环境需配置） |
| `VITE_AUTOSAVE_DEBOUNCE_MS` | `2000` | 自动保存防抖间隔（毫秒） |
| `VITE_SUPABASE_URL` | `https://your-project-id.supabase.co` | Supabase 配置（认证所需） |
| `VITE_SUPABASE_ANON_KEY` | `your-anon-key` |  |
