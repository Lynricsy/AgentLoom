---
docType: tutorial
---

# 开发第一个插件

本教程从零做出一个 WASM 插件：它提供节点「文本回显」，给输入文本加上可配置的前缀。完成后，插件以「已启用」状态注册在你的组织里，节点可以在画布上使用。

第一次执行第 5 步时 cargo 要下载并编译 `extism-pdk` 等依赖，耗时取决于网络。

## 前提

- Node.js 22 与 pnpm（`corepack enable` 后可用）。
- Rust 工具链（[rustup](https://rustup.rs/) 安装），以及 WASM 编译目标：

  ```bash
  rustup target add wasm32-unknown-unknown
  ```

- 本仓库的检出，并已在仓库根目录执行过 `pnpm install`。`@agentloom/plugin-cli` 与 `@agentloom/plugin-sdk` 不在 npm 上发布，CLI 从源码构建。
- 一个 AgentLoom 账号，在目标组织中的角色为 `owner`、`admin` 或 `creator`；`curl` 与 `jq`。
- 两个环境变量：

  ```bash
  export AGENTLOOM_API=https://agentloom.ling.plus/api/v1   # 自托管时换成你的域名
  export JWT='<Studio 登录后的 access token>'
  ```

本页的输出来自一次完整实跑，平台端是本地运行的 `agentloom-server`；输出里的绝对路径是那次实跑的工作目录，你的会不同。

## 1. 构建 CLI

在仓库根目录：

```bash
pnpm --filter @agentloom/plugin-cli build
alias agentloom-plugin="node $PWD/agentloom-plugin-cli/dist/cli.js"
agentloom-plugin --help
```

```text
Usage: agentloom-plugin [options] [command]

AgentLoom Plugin Development CLI

Options:
  -V, --version            output the version number
  -h, --help               display help for command

Commands:
  create [options] <name>  创建新的 AgentLoom 插件项目
  dev [options]            启动插件本地开发服务器
  build [options]          构建 AgentLoom 插件归档
  keys                     管理插件签名密钥
  publish [options]        签名插件包，生成可注册的 .alp（上传经 Studio 插件管理页）
  help [command]           display help for command
```

后续命令都在同一个终端里执行，`alias` 只对当前终端有效。

## 2. 生成签名密钥

换到一个放插件项目的工作目录（仓库外任意位置），生成 RSA 密钥对：

```bash
mkdir -p ~/agentloom-plugins && cd ~/agentloom-plugins
agentloom-plugin keys generate
```

```text
🔑 签名密钥对已生成
公钥: /tmp/docs-verify-apidocs/work2/keys/public.pem
私钥: /tmp/docs-verify-apidocs/work2/keys/private.pem
指纹: 4f341d413d57a12e87e3c4d088654163e466d7f3bbe6c0c67b8f6248c27d5262
📋 请将 public.pem 的内容注册到 AgentLoom 平台。
⚠️  请妥善保管私钥，不要提交到版本控制。
```

`keys/private.pem` 用来签名，只留在本机；`keys/public.pem` 在第 6 步注册到平台。记下指纹，第 6 步会再见到它。

## 3. 创建项目

```bash
agentloom-plugin create text-prefix --wasm
```

按提示输入作者与描述，许可证直接回车用默认值：

```text
✔ 作者名称 … Docs Team
✔ 插件描述 … 给文本加前缀的示例插件
✔ 许可证 … MIT
✨ 插件脚手架已创建：/tmp/docs-verify-apidocs/work2/text-prefix
下一步：cd text-prefix && agentloom-plugin build --wasm
```

```bash
find text-prefix -type f | sort
cd text-prefix
```

```text
text-prefix/Cargo.toml
text-prefix/README.md
text-prefix/manifest.json
text-prefix/node-definitions.json
text-prefix/package.json
text-prefix/src/lib.rs
```

## 4. 看懂节点的两半

节点由两个文件共同定义。`node-definitions.json` 声明节点在画布上的样子：类型 `example.echo`、输入端口 `text`、输出端口 `result`、配置项 `prefix`：

```bash
jq '.[0] | {type, label, inputPorts: [.inputPorts[].id], outputPorts: [.outputPorts[].id], config: (.configSchema.properties | keys)}' node-definitions.json
```

```json
{
  "type": "example.echo",
  "label": "文本回显",
  "inputPorts": [
    "text"
  ],
  "outputPorts": [
    "result"
  ],
  "config": [
    "prefix"
  ]
}
```

`src/lib.rs` 是执行逻辑。平台调用导出函数 `execute`，传入 `{"nodeType","inputs","config"}` 的 JSON，函数返回以输出端口 ID 为键的 JSON：

```rust
match envelope.node_type.as_str() {
    "example.echo" => {
        let text = envelope
            .inputs
            .get("text")
            .and_then(Value::as_str)
            .ok_or_else(|| Error::msg("example.echo 要求 inputs.text 为字符串"))?;
        let prefix = envelope
            .config
            .get("prefix")
            .and_then(Value::as_str)
            .unwrap_or("");

        // 返回端口输出直出对象，禁止包装成 {"outputs": {...}}。
        Ok(json!({ "result": format!("{prefix}{text}") }).to_string())
    }
    node_type => Err(Error::msg(format!("不支持的 nodeType: {node_type}")).into()),
}
```

本教程不改代码，直接构建。

## 5. 构建并签名

```bash
agentloom-plugin build --wasm
```

CLI 执行 `cargo build --target wasm32-unknown-unknown --release`，把产物复制为 `dist/plugin.wasm` 并打包：

```text
📦 插件构建完成
文件: /tmp/docs-verify-apidocs/work2/text-prefix/build/com.agentloom.text-prefix-0.1.0.alp
大小: 90171 bytes
版本: 0.1.0
节点数: 1
```

用第 2 步的私钥签名：

```bash
agentloom-plugin publish -k ../keys/private.pem
```

```text
✅ 插件签名完成
归档: /tmp/docs-verify-apidocs/work2/text-prefix/build/com.agentloom.text-prefix-0.1.0.alp
签名: ShvCNF8YmVZXuYZ/Ahgy0tZG2cIiFF5Y...
内容哈希: 27bdeddda0d3f3e81e5d390f6df1c3f4eca70c16c4fc90909bc5001ba6be9f53
密钥指纹: 4f341d413d57a12e87e3c4d088654163e466d7f3bbe6c0c67b8f6248c27d5262

请通过 Studio 插件管理页上传已签名的 .alp 文件
```

`publish` 只把签名写进归档里的 `manifest.json`，不上传任何东西。

## 6. 注册公钥

```bash
jq -n --rawfile key ../keys/public.pem '{label: "我的笔记本", publicKey: $key}' \
  | curl -s "$AGENTLOOM_API/plugins/developer-keys" \
      -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d @- \
  | jq '{id, label, keyFingerprint, status}'
```

```json
{
  "id": "01a0f6ee-a158-7ddb-9199-12bfa11b1ce7",
  "label": "我的笔记本",
  "keyFingerprint": "4f341d413d57a12e87e3c4d088654163e466d7f3bbe6c0c67b8f6248c27d5262",
  "status": "active"
}
```

`keyFingerprint` 与第 2 步的指纹相同。

## 7. 上传并启用插件

```bash
curl -s "$AGENTLOOM_API/plugins" \
  -H "Authorization: Bearer $JWT" \
  -F status=active \
  -F file=@build/com.agentloom.text-prefix-0.1.0.alp \
  | jq '.data | {pluginId, version, status, nodes: [.nodeDefinitions[].type]}'
```

```json
{
  "pluginId": "com.agentloom.text-prefix",
  "version": "0.1.0",
  "status": "active",
  "nodes": [
    "example.echo"
  ]
}
```

插件已注册并启用。在 Studio 打开任意工作流，节点面板的「Plugin」分组里出现「文本回显」。

第 6、7 步在 Studio 中的等价操作：侧边栏「开发者」进入密钥页点「注册公钥」；侧边栏「资源 → 插件」点「注册插件」，勾选「注册后立即启用」后点「上传并注册」。

## 接下来

- 修改 `src/lib.rs` 与 `node-definitions.json` 后发布新版本：先改 `manifest.json` 的 `version`，删除 `dist/plugin.wasm`（它存在时 `build --wasm` 跳过编译），再执行第 5、7 步。同一组织里同一插件 ID 与版本只能注册一次，重复上传返回 409 `plugin-already-exists`。
- 清单字段、节点定义与签名函数：[Plugin SDK](/api/plugins/sdk)。
- 各命令的参数与本地预览服务器：[Plugin CLI](/api/plugins/cli)。
- 上架到插件市场：[市场与收益](/api/plugins/marketplace)。

## 出错时

| 现象 | 原因 |
| --- | --- |
| `build --wasm` 失败，cargo 报告缺少 `wasm32-unknown-unknown` 目标 | 没有执行 `rustup target add wasm32-unknown-unknown` |
| 上传返回 401 `plugin-signature-invalid` | 签名后归档被改动过，或签名用的私钥对应的公钥未在本组织注册 / 已撤销；重新执行 `publish` 后上传 |
| 上传返回 403 `plugin-signer-mismatch` | 签名用的公钥由组织内其他成员登记；用你自己在「开发者密钥」中登记的密钥签名 |
| 上传返回 400 `plugin-signature-missing` | 没有执行 `publish` |
| 上传返回 422 `plugin-validation-failed`，`插件缺少 wasmEntry` | 上传的是 TypeScript 预览项目的归档；只有 `create --wasm` 项目能注册 |
| 上传返回 409 `plugin-already-exists` | 该版本已注册，提升 `version` 后重新构建 |

签名后改动归档的实际响应：

```text
{"type":"https://agentloom.dev/errors/plugin-signature-invalid","title":"Plugin Signature Invalid","status":401,"detail":"插件 \"com.agentloom.text-prefix\" 的签名验证失败。归档可能已被篡改或使用了错误的签名密钥。","instance":"/api/v1/plugins"}
```
