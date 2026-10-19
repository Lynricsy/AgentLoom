---
docType: reference
---

# Sandbox

为 Agent 提供一个隔离的代码执行环境。节点运行时创建（或恢复）沙箱会话，通过「沙箱」端口交给 Agent，Agent 在其中运行代码和终端命令。

## 端口与配置

<!--@include: ../../_generated/nodes/sandbox.md-->

## 使用要点

- 配置面板的「生命周期模式」有「临时」与「持久」两种：「临时」按本次执行创建会话，可设置 CPU（0.5–4 核）、Memory、Disk 与 Timeout（`0` 表示不超时，上限 168 小时），也可选用预设；「持久」需要「选择持久沙箱」，复用侧边栏「资源 → 沙箱」中已存在的持久沙箱。
- Memory 默认 512 MB，够运行脚本和轻量命令。要在沙箱里对真实代码仓库执行 `npm install`、编译或跑测试时，建议调到 2048 MB 以上：512 MB 下安装几百个依赖包会耗尽内存。内存耗尽时内核只终止占用最多的进程（通常是正在执行的安装命令，命令输出 `Killed`、退出码 137），Agent 会话继续可用，可以据此调整做法。
- 如果 Agent 运行时本身在回合中途中断，这一轮标记为失败，已输出的部分保留并标为不完整，错误信息说明原因，例如「沙箱 VM 内存不足，内核 OOM 终止了进程：npm install（pid 715，12 秒前）……请在 Agent 画布的 Sandbox 节点调高内存（当前 512 MB）后重试」。下一条消息会自动重建沙箱会话并重新载入对话历史，工作区文件保留。
- 沙箱内的命令以 root 运行，`HOME` 为 `/root`，npm、pip、uv、git 的缓存与配置可以写入；环境中没有 `NODE_ENV`，`npm install` 按 npm 默认安装 devDependencies。
- 「工作区」输入端口可连接 [Workspace](/guide/nodes/workspace) 节点，让沙箱内的文件读写保存到该工作区。
- 「沙箱」端口连接到 [Agent](/guide/nodes/agent) 节点的「沙箱」端口（只能连一个）。只有运行模式为「有沙箱」的 Agent 才有该端口。
- 节点会等到沙箱会话就绪（最长 30 秒）才算完成，此时「沙箱」端口输出的 `status` 为 `ready`。沙箱由部署中的 Firecracker 运行时提供；部署未启用该运行时、创建失败或超时未就绪时，节点失败，错误信息给出失败原因（如 `Sandbox creation failed: …`）。部署要求见 [Firecracker 沙箱](/deploy/firecracker)。
- Agent 画布中该节点名称显示为「沙箱环境」，每个 Agent 画布最多一个。

## 相关

- [Workspace](/guide/nodes/workspace)
- [Agent](/guide/nodes/agent)
- [创建 Agent](/guide/agents/creating)
