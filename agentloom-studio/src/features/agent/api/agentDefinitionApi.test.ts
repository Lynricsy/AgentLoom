import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * `PUT /agent-definitions/:id/canvas` 的 server DTO
 * (`agentloom-server/src/modules/agent-definition/dto/save-agent-canvas.dto.ts`)
 * 声明的是 camelCase 字段且为 `.strict()`，**不接受 snake_case**。
 *
 * 兄弟端点（create / publish）在 DTO 里同时接受 camel 与 snake 别名，所以它们
 * 可以套 `toSnakeBody()`；canvas 端点没有别名，套上就会 422
 * （`canvasNodes: expected array, received undefined`）。
 * 这条测试把该差异钉死，避免再次把整个画布保存改成 snake_case。
 */

const AGENT_ID = "01a01e35-ac80-7a19-b0ba-2cf0836d3a56";

describe("Agent strict DTO 请求体大小写", () => {
  let fetchMock: Mock;
  let sentBody: Record<string, unknown> | null;
  let sentRequest: Request | null;
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api/v1");
    sentBody = null;
    sentRequest = null;
    // 在 mock 内读取 body：ky 发出请求后 body stream 已被消费，事后 clone 不可用。
    fetchMock = vi.fn(async (input: Request) => {
      sentRequest = input;
      sentBody = (await input.text()
        .then((text) => (text ? JSON.parse(text) : null))) as Record<
        string,
        unknown
      > | null;
      return new Response(JSON.stringify({ data: { version: 2 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("以 camelCase 发送画布字段，不做 snake_case 转换", async () => {
    // 动态 import 是必需的：shared/api/client 在模块求值时就读取了
    // import.meta.env.VITE_API_BASE_URL 并构造 ky 实例，因此必须先 stubEnv
    // 再加载该模块；静态 import 会在 stub 生效前固化 prefixUrl。
    const { saveAgentCanvas } = await import("./agentDefinitionApi");

    const result = await saveAgentCanvas(AGENT_ID, {
      canvasNodes: [],
      canvasEdges: [],
      canvasViewport: { x: 0, y: 0, zoom: 1 },
      inputSchema: null,
      memoryInstanceIds: [],
    } as never);

    expect(result).toEqual({ version: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = sentBody ?? {};

    // server DTO 要求的 canonical 键必须原样出现
    expect(body).toHaveProperty("canvasNodes");
    expect(body).toHaveProperty("canvasEdges");
    expect(body).toHaveProperty("canvasViewport");
    expect(body).toHaveProperty("memoryInstanceIds");

    // snake_case 变体一旦出现就说明又套了 toSnakeBody
    expect(body).not.toHaveProperty("canvas_nodes");
    expect(body).not.toHaveProperty("canvas_edges");
    expect(body).not.toHaveProperty("canvas_viewport");
    expect(body).not.toHaveProperty("memory_instance_ids");
  });

  it("以 PUT 和 camelCase body 更新 Agent，且只由 prefixUrl 添加 API 前缀", async () => {
    const { updateAgent } = await import("./agentDefinitionApi");

    const result = await updateAgent(AGENT_ID, {
      version: 4,
      name: "更新后的 Agent",
      description: null,
      icon: "bot",
      globalSandboxConfig: {
        networkPolicy: "restricted",
      },
    });

    expect(result).toEqual({ version: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentRequest?.method).toBe("PUT");
    expect(sentRequest?.url).toBe(
      `http://localhost/api/v1/agent-definitions/${AGENT_ID}`,
    );
    expect(sentRequest?.url).not.toContain("/api/v1/api/v1/");
    expect(sentBody).toEqual({
      version: 4,
      name: "更新后的 Agent",
      description: null,
      icon: "bot",
      globalSandboxConfig: {
        networkPolicy: "restricted",
      },
    });
    expect(sentBody).not.toHaveProperty("global_sandbox_config");
  });
});
