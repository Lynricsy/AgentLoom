# agentloom-firecracker-runtime

Go 实现的 Firecracker 沙箱运行时：宿主侧 `runtime-manager`（mTLS HTTP API，server/worker 通过它创建与操作 microVM）、guest 内守护进程 `agentloom-guestd`，以及 preflight、jailer 包装、产物清单与沙箱迁移工具。server/worker 本身不持有 KVM、网络或 cgroup 特权。

|命令目录|用途|
|---|---|
|`cmd/runtime-manager`|宿主 runtime manager 入口|
|`cmd/agentloom-guestd`|microVM 内守护进程，打包进 rootfs|
|`cmd/preflight`|宿主环境预检（状态目录、产物清单、内核版本、swap 等）|
|`cmd/jailer-wrapper`|Firecracker jailer 包装（父进程退出信号、cgroup 参数改写）|
|`cmd/build-artifact-manifest`|按 artifact lock 生成产物清单 `manifest.json`|
|`cmd/sandbox-cutover`|沙箱切换维护工具：`export` / `restore` / `activate` / `rollback` / `finalize`，要求 `APP_SANDBOX_MAINTENANCE_MODE=true`|

## 开发命令

在 `agentloom-firecracker-runtime/` 内运行（Go 版本见 `go.mod`）：

```bash
go test ./...
go vet ./...
go build ./...
```

runtime manager 的 mTLS 证书由 `agentloom-deploy/scripts/generate-firecracker-pki.sh` 生成；guest 产物与运行时镜像由 `agentloom-deploy/firecracker/build-artifacts.sh` 与 `agentloom-deploy/firecracker/build-runtime-image.sh` 构建。

## 文档

- 内部结构与 HTTP API：`agentloom-docs/dev/firecracker-runtime.md`
- 部署与运维：`agentloom-docs/deploy/firecracker.md`
