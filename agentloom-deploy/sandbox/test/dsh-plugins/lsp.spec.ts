/**
 * agentloom-lsp 插件：真实 Cordis Context + 真实 ToolRuntime / SystemPrompt /
 * LocalSubprocessRuntime，语言服务器为 test/fixtures/fake-lsp-server.mjs
 * （经 <workdir>/node_modules/.bin/typescript-language-server 包装脚本被插件发现）。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import type { ToolCallId } from "@deepseek-ai/dsh-llm";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime, {
  defineTool,
  type ToolExecutionResult,
} from "@deepseek-ai/dsh-tools";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import * as lspPlugin from "../../src/dsh-plugins/lsp/index.js";

const FAKE_SERVER = fileURLToPath(
  new URL("../fixtures/fake-lsp-server.mjs", import.meta.url),
);

interface Harness {
  ctx: Context;
  workdir: string;
  dispose: () => Promise<void>;
}

const tempDirs: string[] = [];
let callSeq = 0;

async function createWorkdir(firstPublishDelayMs = 0): Promise<string> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "agentloom-lsp-"));
  tempDirs.push(workdir);
  await fs.writeFile(path.join(workdir, "package.json"), "{}\n");
  const binDir = path.join(workdir, "node_modules", ".bin");
  await fs.mkdir(binDir, { recursive: true });
  const wrapper = path.join(binDir, "typescript-language-server");
  const delayEnv =
    firstPublishDelayMs > 0
      ? `FAKE_LSP_FIRST_PUBLISH_DELAY_MS=${firstPublishDelayMs} `
      : "";
  await fs.writeFile(
    wrapper,
    `#!/bin/sh\n${delayEnv}exec "${process.execPath}" "${FAKE_SERVER}" "$@"\n`,
    {
      mode: 0o755,
    },
  );
  await fs.writeFile(
    path.join(workdir, "a.ts"),
    "const greeting = 'hi';\nconsole.log(greeting);\n",
  );
  return workdir;
}

async function createHarness(
  allowEdits: boolean,
  firstPublishDelayMs = 0,
): Promise<Harness> {
  const workdir = await createWorkdir(firstPublishDelayMs);
  const ctx = new Context();
  const fibers = [
    ctx.plugin(SystemPrompt, {}),
    ctx.plugin(ToolRuntime, {}),
    ctx.plugin(LocalSubprocessRuntime),
  ];
  for (const fiber of fibers) await fiber;
  // 代替 dsh-tool-fs 的 write：真实写盘，结果走同一条 post-execute 管线
  const writeFiber = ctx.plugin({
    name: "test-write-tool",
    inject: ["tools"],
    apply(inner: Context) {
      inner.tools.register(
        defineTool({
          name: "write",
          description: "test write",
          parameters: {
            file_path: { type: "string", required: true },
            content: { type: "string", required: true },
          },
          output: {
            schema: { type: "string" },
            render: (_args, value) => [{ type: "text", text: value }],
          },
          async execute(args) {
            await fs.writeFile(
              path.resolve(workdir, args.file_path),
              args.content,
            );
            return `Wrote ${args.file_path}`;
          },
        }),
      );
    },
  });
  const lspFiber = ctx.plugin(lspPlugin, { workdir, allowEdits });
  await writeFiber;
  await lspFiber;
  return {
    ctx,
    workdir,
    dispose: async () => {
      await lspFiber.dispose();
      await writeFiber.dispose();
      for (const fiber of fibers.reverse()) await fiber.dispose();
    },
  };
}

async function run(
  ctx: Context,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  callSeq += 1;
  return ctx.tools.execute({
    callId: `call-${callSeq}` as ToolCallId,
    name,
    arguments: args,
    signal: new AbortController().signal,
  });
}

function textOf(result: ToolExecutionResult): string {
  return result.content
    .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
    .join("");
}

afterAll(async () => {
  await Promise.all(
    tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("agentloom-lsp 冷启动", () => {
  it("写操作触发 server 冷启动、首轮诊断晚于 1.5 s 时仍附带诊断", async () => {
    // microVM 中 tsserver 冷启动首轮诊断约 5 s；这里用 2.5 s 越过已就绪时的 1.5 s 窗口
    const harness = await createHarness(true, 2500);
    try {
      const result = await run(harness.ctx, "write", {
        file_path: "demo.ts",
        content: "export const n: number = ERROR;\n",
      });
      expect(textOf(result)).toContain(
        "[lsp diagnostics for demo.ts] 1 error(s), 0 warning(s):",
      );
    } finally {
      await harness.dispose();
    }
  }, 20_000);
});

describe("agentloom-lsp（allowEdits: true）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness(true);
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it("注册 lsp 工具与 tool:lsp 提示段", async () => {
    const assembly = await harness.ctx.systemPrompt.assemble();
    expect(assembly.tools.map((tool) => tool.name)).toContain("lsp");
    const section = assembly.sections.find(
      (entry) => entry.name === "tool:lsp",
    );
    expect(section?.text).toContain("Use the lsp tool for diagnostics");
  });

  it("hover 返回 server 的 markdown，definition / references 格式化为 path:line:col", async () => {
    const hover = await run(harness.ctx, "lsp", {
      action: "hover",
      file: "a.ts",
      symbol: "greeting",
    });
    expect(hover.isError).toBe(false);
    expect(textOf(hover)).toContain("FAKE_HOVER_DOC");
    expect(textOf(hover)).toContain("const greeting: string");

    const definition = await run(harness.ctx, "lsp", {
      action: "definition",
      file: "a.ts",
      line: 2,
      column: 13,
    });
    expect(textOf(definition)).toContain("a.ts:1:7  const greeting = 'hi';");

    const references = await run(harness.ctx, "lsp", {
      action: "references",
      file: path.join(harness.workdir, "a.ts"),
      symbol: "greeting",
    });
    expect(textOf(references)).toContain("2 reference(s)");
    expect(textOf(references)).toContain("a.ts:2:13  console.log(greeting);");
  });

  it("diagnostics 按严重度排序输出 path:line:col severity code message", async () => {
    await fs.writeFile(
      path.join(harness.workdir, "b.ts"),
      "let x = 1; // WARN\nlet y: number = ERROR;\n",
    );
    const result = await run(harness.ctx, "lsp", {
      action: "diagnostics",
      file: "b.ts",
    });
    const lines = textOf(result).split("\n");
    expect(lines[0]).toBe("b.ts: 1 error(s), 1 warning(s), 0 other");
    expect(lines[1]).toBe(
      "b.ts:2:17 error 2322 Type 'string' is not assignable to type 'number'.",
    );
    expect(lines[2]).toBe("b.ts:1:15 warning W1 Suspicious WARN marker.");
  });

  it("rename 默认只预览，apply=true 后写盘", async () => {
    const file = path.join(harness.workdir, "a.ts");
    const preview = await run(harness.ctx, "lsp", {
      action: "rename",
      file: "a.ts",
      symbol: "greeting",
      new_name: "salute",
    });
    expect(textOf(preview)).toContain(
      "Rename preview (not applied): 2 edit(s) in 1 file(s)",
    );
    expect(textOf(preview)).toContain("a.ts:1: + const salute = 'hi';");
    expect(await fs.readFile(file, "utf8")).toContain("greeting");

    const applied = await run(harness.ctx, "lsp", {
      action: "rename",
      file: "a.ts",
      symbol: "greeting",
      new_name: "salute",
      apply: true,
    });
    expect(textOf(applied)).toContain("Rename applied: 2 edit(s) in 1 file(s)");
    expect(await fs.readFile(file, "utf8")).toBe(
      "const salute = 'hi';\nconsole.log(salute);\n",
    );
  });

  it("write 的 post-execute：诊断非空时追加 [lsp diagnostics for …]，为空时原样", async () => {
    const dirty = await run(harness.ctx, "write", {
      file_path: "demo.ts",
      content: "export const n: number = ERROR;\n",
    });
    expect(dirty.isError).toBe(false);
    const text = textOf(dirty);
    expect(text).toContain("Wrote demo.ts");
    expect(text).toContain(
      "[lsp diagnostics for demo.ts] 1 error(s), 0 warning(s):",
    );
    expect(text).toContain(
      "demo.ts:1:26 error 2322 Type 'string' is not assignable",
    );

    const clean = await run(harness.ctx, "write", {
      file_path: "demo.ts",
      content: "export const n: number = 1;\n",
    });
    expect(textOf(clean)).toBe("Wrote demo.ts");
  });

  it("status 列出可用 server 与运行中实例；无条目扩展名返回不可用文案；越界路径报错", async () => {
    await run(harness.ctx, "lsp", { action: "hover", file: "a.ts", line: 1 });
    const status = textOf(await run(harness.ctx, "lsp", { action: "status" }));
    expect(status).toContain(
      `typescript: ${path.join(harness.workdir, "node_modules", ".bin", "typescript-language-server")}`,
    );
    expect(status).toMatch(/typescript {2}root=\. {2}running/);

    await fs.writeFile(path.join(harness.workdir, "x.rb"), "puts 1\n");
    const unavailable = textOf(
      await run(harness.ctx, "lsp", { action: "diagnostics", file: "x.rb" }),
    );
    expect(unavailable).toMatch(
      /^No language server available for \.rb\. Available: typescript\(/,
    );

    const escaped = await run(harness.ctx, "lsp", {
      action: "hover",
      file: "../outside.ts",
      line: 1,
    });
    expect(escaped.isError).toBe(true);
    expect(textOf(escaped)).toContain("path must be under");
  });
});

describe("agentloom-lsp（allowEdits: false）", () => {
  it("rename apply=true 返回禁用文案且不改文件；预览仍可用", async () => {
    const harness = await createHarness(false);
    try {
      const file = path.join(harness.workdir, "a.ts");
      const before = await fs.readFile(file, "utf8");
      const denied = await run(harness.ctx, "lsp", {
        action: "rename",
        file: "a.ts",
        symbol: "greeting",
        new_name: "salute",
        apply: true,
      });
      expect(textOf(denied)).toBe(
        "lsp apply is disabled by the agent's native tool policy (editEnabled=false)",
      );
      expect(await fs.readFile(file, "utf8")).toBe(before);

      const preview = await run(harness.ctx, "lsp", {
        action: "rename",
        file: "a.ts",
        symbol: "greeting",
        new_name: "salute",
      });
      expect(textOf(preview)).toContain("Rename preview (not applied)");
    } finally {
      await harness.dispose();
    }
  });
});
