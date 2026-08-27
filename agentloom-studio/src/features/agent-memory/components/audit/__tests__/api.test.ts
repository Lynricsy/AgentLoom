import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const INSTANCE_ID = "22222222-2222-4222-8222-222222222222";
const NODE_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "66666666-6666-4666-8666-666666666666";

describe("memory audit API 契约", () => {
  let fetchMock: Mock;
  let requests: Request[];
  let requestBodies: unknown[];

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api/v1");
    requests = [];
    requestBodies = [];
    fetchMock = vi.fn(async (input: Request) => {
      requests.push(input);
      requestBodies.push(
        input.method === "GET" ? null : await input.clone().json(),
      );
      return new Response(
        JSON.stringify({
          data: [{ id: VERSION_ID }],
          meta: { page: 1, page_size: 20, total: 1, total_pages: 1 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("请求真实 audit 路由并解包 pending 与 versions 信封", async () => {
    const { fetchAuditLog, fetchNodeVersions, fetchPendingReviews } =
      await import("../api");

    await expect(
      fetchAuditLog(INSTANCE_ID, { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      data: [{ id: VERSION_ID }],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    await expect(fetchPendingReviews(INSTANCE_ID)).resolves.toEqual([
      { id: VERSION_ID },
    ]);
    await expect(fetchNodeVersions(INSTANCE_ID, NODE_ID)).resolves.toEqual([
      { id: VERSION_ID },
    ]);

    expect(requests.map((request) => request.url)).toEqual([
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/audit?page=1&page_size=20`,
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/pending-reviews`,
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/nodes/${NODE_ID}/versions`,
    ]);
  });

  it("把 review 标识放入路由且请求体只发送 action", async () => {
    const { submitReview } = await import("../api");

    await submitReview(INSTANCE_ID, {
      nodeId: NODE_ID,
      versionId: VERSION_ID,
      action: "approve",
    });

    expect(requests[0]?.url).toBe(
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/nodes/${NODE_ID}/versions/${VERSION_ID}/review`,
    );
    expect(requests[0]?.method).toBe("POST");
    expect(requestBodies[0]).toEqual({ action: "approve" });
  });

  it("请求节点级 rollback 路由并发送 camelCase targetVersionId", async () => {
    const { rollbackVersion } = await import("../api");

    await rollbackVersion({
      instanceId: INSTANCE_ID,
      nodeId: NODE_ID,
      versionId: VERSION_ID,
    });

    expect(requests[0]?.url).toBe(
      `http://localhost/api/v1/memory-instances/${INSTANCE_ID}/nodes/${NODE_ID}/rollback`,
    );
    expect(requests[0]?.method).toBe("POST");
    expect(requestBodies[0]).toEqual({ targetVersionId: VERSION_ID });
  });
});
