---
docType: explanation
---

# 移动端概览

移动端能做什么、连接哪台服务器、哪些事情仍要回到 Web Studio？本页回答这三个问题。逐屏的入口与字样见[移动端功能](/guide/mobile/features)。

AgentLoom 移动端是一个 Flutter 客户端，与 Web Studio 使用同一套账号和同一个后端。登录页的说明文字概括了它的定位：「在移动端管理资源、运行工作流、与 Agent 对话，并在需要时继续跳转 Web Studio 进行画布编排。」

## 它连接哪台服务器

客户端只保存一个地址：Studio 基础地址。API 地址由它推导，即同一主机下的 `/api/v1` 路径。

- 内置默认值来自构建时选择的环境文件（`agentloom_mobile/.env.dev`、`agentloom_mobile/.env.staging`、`agentloom_mobile/.env.prod`），三份文件当前都指向 `https://agentloom.ling.plus`。
- 登录页和注册页右上角的按钮显示当前主机名，点击后进入「连接与服务器」页，可在「Studio 基础地址」中改为自托管的地址。输入 `agentloom.example.com`、`https://agentloom.example.com` 或带 `/api/v1` 后缀的地址都会被规范化为同一个基础地址；不带协议的 `localhost` 与 IP 地址按 `http` 处理，其余按 `https` 处理。
- 「恢复默认地址」回到构建时的默认值。

构建与运行客户端的命令见[移动端开发](/dev/mobile)。

## 账号从哪里来

移动端登录只接受邮箱与密码。账户启用了双因素认证时，输入密码后进入「两步验证」页，需要输入身份验证器应用中的 6 位验证码。

注册页可以创建账号，但不能完成首次组织初始化。注册成功后，应用提示前往 Web Studio 登录并完成组织设置，之后再回到移动端登录。

登录页目前不显示第三方登录入口（`agentloom_mobile/lib/features/auth/screens/login_screen.dart` 中的 `_showSocialLoginEntry` 为 `false`）。

## 移动端与 Web Studio 的分工

移动端覆盖查看、运行和对话；编排与内容编辑留在 Web Studio。

| 任务 | 移动端 | 需要 Web Studio |
| --- | --- | --- |
| 工作流 | 浏览、按参数表单启动已发布的工作流、实时查看执行 | 画布编辑；以对话式或混合式收集参数的工作流也需在 Web 端启动 |
| Agent | 浏览、新建对话、继续对话、处理工具授权、查看运行上下文 | 创建与配置 Agent |
| 技能 | 浏览、编辑名称与描述、归档、删除 | 编辑 SKILL.md 内容、上传文件；内置技能不可编辑 |
| 知识库 | 浏览、新建、重建、删除 | 上传文档 |
| 记忆 | 浏览实例、节点、版本与审计日志 | — |
| 工作区、Sandbox、MCP 服务、LLM 模型 | 浏览与管理（见[移动端功能](/guide/mobile/features)） | — |
| 组织初始化 | 不支持 | 注册后的首次组织设置 |

## 推送通知

在 Android 与 iOS 上，客户端通过 Firebase Messaging 接收工作流执行通知；Web 构建不启用推送。点击带执行 ID 的通知会打开该执行的「执行监控」页。

## 相关页面

- [移动端功能](/guide/mobile/features)
- [Agent 概述](/guide/agents/)
- [账户安全](/guide/account/security)
