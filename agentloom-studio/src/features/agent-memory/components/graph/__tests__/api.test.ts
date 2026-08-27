import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const INSTANCE_ID = "22222222-2222-4222-8222-222222222222";
const NODE_ID = "33333333-3333-4333-8333-333333333333";

describe("memory graph API 契约", () => {
  let fetchMock: Mock;
  let requests: Request[];

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api/v1");
    requests = [];
    fetchMock = vi.fn(async (input: Request) => {
      requests.push(input);
      return new Response(JSON.stringify({ data: [{ id: "row-1" }], meta: {} }), {
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

  it("使用 prefixUrl 下的资源相对路径且解包列表信封", async () => {
    const {
      fetchMemoryEdges,
      fetchMemoryNodeDetail,
      fetchMemoryNodes,
      fetchMemoryNodeVersions,
    } = await import("../api");

    await expect(fetchMemoryNodes(INSTANCE_ID)).resolves.toEqual([
      { id: "row-1" },
    ]);
    await expect(fetchMemoryEdges(INSTANCE_ID)).resolves.toEqual([
      { id: "row-1" },
    ]);
    await expect(
      fetchMemoryNodeDetail(INSTANCE_ID, NODE_ID),
    ).resolves.toEqual([{ id: "row-1" }]);
    await expect(
      fetchMemoryNodeVersions(INSTANCE_ID, NODE_ID),
    ).resolves.toEqual([{ id: "row-1" }]);

    expect(requests.map((request) => request.url)).toEqual([
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/nodes`,
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/edges`,
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/nodes/${NODE_ID}`,
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/nodes/${NODE_ID}/versions`,
    ]);
    expect(requests.every((request) => !request.url.includes("api/v1/api/v1"))).toBe(true);
  });
});
