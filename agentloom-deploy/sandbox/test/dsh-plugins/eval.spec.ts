/**
 * agentloom-eval：在真实 cordis Context（SystemPrompt + ToolRuntime + 本地 subprocess + LlmRuntime）
 * 中加载插件，经 ctx.tools.execute 调 eval，真实 python3 子进程执行。
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { LlmRuntime, ToolCallId } from "@deepseek-ai/dsh-llm";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime, {
  defineTool,
  type ToolExecution,
} from "@deepseek-ai/dsh-tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as evalPlugin from "../../src/dsh-plugins/eval/index.js";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** 可用 AGENTLOOM_TEST_PYTHON 指定解释器（如 python3.11）验证兼容性 */
const PYTHON = process.env.AGENTLOOM_TEST_PYTHON || "python3";

describe("agentloom-eval（真实 python3）", () => {
  let ctx: Context;
  let workdir: string;
  let stateDir: string;
  let callSeq = 0;
  const grepCalls: Array<{ args: unknown; exec: ToolExecution }> = [];
  let slowWriteAborted = false;

  async function runEval(args: {
    code: string;
    timeout?: number;
    reset?: boolean;
  }) {
    const result = await ctx.tools.execute({
      callId: ToolCallId(`call-${++callSeq}`),
      name: "eval",
      arguments: args,
      signal: new AbortController().signal,
    });
    if (result.isError) throw new Error(`eval failed: ${result.error.message}`);
    return result.value as { text: string; images?: unknown[] };
  }

  beforeAll(async () => {
    workdir = mkdtempSync(join(tmpdir(), "agentloom-eval-ws-"));
    stateDir = mkdtempSync(join(tmpdir(), "agentloom-eval-state-"));
    ctx = new Context();
    await ctx.plugin(SystemPrompt, {});
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(LocalSubprocessRuntime);
    await ctx.plugin(LlmRuntime);
    // 供 tool() 回环调用的假 grep（经真实 ToolRuntime 嵌套分派）
    ctx.tools.register(
      defineTool({
        name: "grep",
        description: "fake grep",
        parameters: { pattern: { type: "string", required: true } },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { a: { type: "integer", required: true } },
          },
          render: (_args, value) => [
            { type: "text", text: JSON.stringify(value) },
          ],
        },
        execute: async (args, exec) => {
          grepCalls.push({ args, exec });
          return { a: 1 };
        },
      }),
    );
    // 慢写入工具：3 s 后写盘，除非调用被取消（验证 cell 超时会取消子工具）
    ctx.tools.register(
      defineTool({
        name: "slow_write",
        description: "slow write",
        parameters: {},
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }],
        },
        execute: async (_args, exec) => {
          const { promise, resolve, reject } = Promise.withResolvers<void>();
          const timer = setTimeout(resolve, 3000);
          exec.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            slowWriteAborted = true;
            reject(new Error("aborted"));
          });
          await promise;
          writeFileSync(
            join(workdir, "late.txt"),
            "written after eval returned",
          );
          return "written";
        },
      }),
    );
    await ctx.plugin(evalPlugin, { workdir, stateDir, pythonPath: PYTHON });
  });

  afterAll(async () => {
    await ctx?.root.fiber.dispose();
    rmSync(workdir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("注册 eval 工具与 tool:eval 提示段", async () => {
    expect(ctx.tools.get("eval")).toBeDefined();
    const assembly = await ctx.systemPrompt.assemble({});
    expect(
      assembly.sections.some((section) => section.name === "tool:eval"),
    ).toBe(true);
  });

  it("变量跨调用保留，末尾表达式作为 value 返回", async () => {
    await runEval({ code: "x = 1" });
    const { text } = await runEval({ code: "x + 1" });
    expect(text).toContain("--- value ---\n2");
  });

  it("捕获 stdout / stderr，以及子进程直接写 fd 的输出", async () => {
    const { text } = await runEval({
      code: "import os, sys\nprint('hi')\nprint('warn', file=sys.stderr)\nos.system('echo from-fd')",
    });
    expect(text).toContain("hi");
    expect(text).toContain("from-fd");
    expect(text).toContain("--- stderr ---\nwarn");
    expect(text).toContain("--- value ---\n0");
  });

  it("异常返回 traceback", async () => {
    const { text } = await runEval({
      code: "def f():\n    raise ValueError('boom')\nf()",
    });
    expect(text).toContain("--- error ---");
    expect(text).toContain("ValueError: boom");
    expect(text).not.toContain("runner.py");
  });

  it("超时中断 cell，内核与状态保留", async () => {
    const started = Date.now();
    const interrupted = await runEval({
      code: "import time\ntime.sleep(5)",
      timeout: 1,
    });
    expect(interrupted.text).toContain("Execution interrupted");
    expect(Date.now() - started).toBeLessThan(4000);
    const next = await runEval({ code: "x" });
    expect(next.text).toContain("--- value ---\n1");
    expect(next.text).not.toContain("kernel restarted");
  });

  it("cell 超时会取消仍在运行的子工具调用，不会在 eval 返回后继续写盘", async () => {
    const interrupted = await runEval({
      code: "tool('slow_write')",
      timeout: 1,
    });
    expect(interrupted.text).toContain("Execution interrupted");
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect(slowWriteAborted).toBe(true);
    expect(existsSync(join(workdir, "late.txt"))).toBe(false);
  }, 15_000);
  it("tool() 经 ToolRuntime 嵌套调用其他工具并返回其 JSON 值", async () => {
    grepCalls.length = 0;
    const { text } = await runEval({ code: "tool('grep', pattern='x')['a']" });
    expect(text).toContain("--- value ---\n1");
    expect(grepCalls).toHaveLength(1);
    expect(grepCalls[0]?.args).toEqual({ pattern: "x" });
    expect(grepCalls[0]?.exec.parent).toBeDefined();
    expect(String(grepCalls[0]?.exec.callId)).toMatch(/^call-\d+:eval:1$/);
  });

  it("tool() 的失败以 ToolError 抛出；eval 不能调用自身", async () => {
    const missing = await runEval({
      code: "try:\n    tool('no_such_tool')\nexcept ToolError as e:\n    r = str(e)\nr",
    });
    expect(missing.text).toMatch(/--- value ---\n'.*no_such_tool/);
    const self = await runEval({
      code: "try:\n    tool('eval', code='1')\nexcept ToolError as e:\n    r = str(e)\nr",
    });
    expect(self.text).toContain("eval cannot call itself");
  });

  it("show() 写出图片并在文本中列出路径（attachments 未挂载时不附图）", async () => {
    const value = await runEval({
      code: `import base64\nshow(base64.b64decode('${PNG_1X1}'))`,
    });
    const match = /--- images ---\n(\S+\.png)/.exec(value.text);
    expect(match?.[1]).toBeDefined();
    expect(match?.[1]?.startsWith(join(workdir, "eval-output"))).toBe(true);
    expect(existsSync(match![1]!)).toBe(true);
    expect(value.images).toBeUndefined();
  });

  it("reset 后状态清空", async () => {
    const { text } = await runEval({ code: "x", reset: true });
    expect(text).toContain("NameError");
    expect(text).not.toContain("kernel restarted");
  });

  it("内核意外退出后下次调用自动重启并注明", async () => {
    const crashed = await runEval({ code: "import os\nos._exit(3)" });
    expect(crashed.text).toContain("Python kernel exited unexpectedly");
    const next = await runEval({ code: "40 + 2" });
    expect(next.text).toContain("[kernel restarted");
    expect(next.text).toContain("--- value ---\n42");
  });

  it("cell 吞掉中断时宽限期后终止内核，下次调用重启", async () => {
    const stuck = await runEval({
      code: "import time\nwhile True:\n    try:\n        time.sleep(10)\n    except KeyboardInterrupt:\n        pass",
      timeout: 1,
    });
    expect(stuck.text).toContain(
      "Execution interrupted (timeout); the kernel did not stop",
    );
    const next = await runEval({ code: "1 + 1" });
    expect(next.text).toContain("[kernel restarted");
    expect(next.text).toContain("--- value ---\n2");
  }, 15_000);

  it("timeout 越界时报错", async () => {
    const result = await ctx.tools.execute({
      callId: ToolCallId(`call-${++callSeq}`),
      name: "eval",
      arguments: { code: "1", timeout: 0 },
      signal: new AbortController().signal,
    });
    expect(result.isError).toBe(true);
  });
});
