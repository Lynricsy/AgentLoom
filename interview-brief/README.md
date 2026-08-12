# AgentLoom · 系统设计复盘手册

面向面试复盘的 A4 技术文档，53 页，瑞士国际主义视觉（IKB 克莱因蓝）。

## 产物

`out/AgentLoom-系统设计复盘手册.pdf`

## 重新生成

```bash
cd interview-brief
node build.mjs
```

构建脚本会：

1. 按文件名顺序拼接 `src/*.html` 片段成单文件 HTML；
2. 自动注入页眉、页码，并按 `data-ref` ↔ `data-sec` 解析目录页码；
3. 用 headless Chrome 输出 A4 PDF（`preferCSSPageSize`，`@page { margin: 0 }`，每页固定 210×297mm）；
4. 做版面体检：任一 `.page` 出现纵向溢出、横向滚动，或任意后代元素越出页面内容盒，都会在退出码非零的同时列出页号与元素。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/00-head.html` | 设计系统：字体挂载、配色变量、排版层级、卡片/表格/图元组件 |
| `src/01-front.html` | 封面、阅读指南、目录、数字速览 |
| `src/02-partA.html` | A 全景：定位、拓扑、包边界、数据模型 |
| `src/03-partB.html` | B 执行内核：管线、多租户、版本、调度、检查点、实时协议 |
| `src/04-partC.html` | C 智能体：边界、版本漂移、双运行态、Skill、Memory、自进化 |
| `src/05-partD.html` | D 隔离与生态：Firecracker、ACP、回调中继、插件、生成应用 |
| `src/06-partE.html` | E 平台面：Studio、类型引擎、加密、审计、配额、RAG、移动端、部署 |
| `src/07-partF.html` | F 复盘：技术债清单、面试问答速查、自我介绍脚本 |

## 字体依赖

本机需要 `noto-fonts-cjk`、`inter-font`、`ttf-jetbrains-mono`。CSS 通过 `file://` 直接挂载字体文件，绕开 fontconfig 的泛用族解析。

## 内容口径

所有数字来自本地工作树的实际命令输出（`find` / `wc -l` / `git rev-list` / `pgTable` 正则计数），不做估算。与实现不符的设计描述统一收敛到 F1「已知缺口清单」，正文不做粉饰。
