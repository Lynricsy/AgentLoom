import type { ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeBasesPage } from "./KnowledgeBasesPage";
import type { KnowledgeBase } from "../types";

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  useKnowledgeBases: vi.fn(),
  useAllKnowledgeBases: vi.fn(),
  useCreateKnowledgeBase: vi.fn(),
  useDeleteKnowledgeBase: vi.fn(),
  navigate: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../hooks/useKnowledgeBases", () => ({
  useKnowledgeBases: mocks.useKnowledgeBases,
  useAllKnowledgeBases: mocks.useAllKnowledgeBases,
  useCreateKnowledgeBase: mocks.useCreateKnowledgeBase,
  useDeleteKnowledgeBase: mocks.useDeleteKnowledgeBase,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

// --- Test data factory ---

function createKnowledgeBase(
  overrides: Partial<KnowledgeBase> = {},
): KnowledgeBase {
  return {
    id: "kb-1",
    tenantId: "tenant-1",
    name: "测试知识库",
    description: "这是一个测试知识库",
    visibility: "private" as const,
    createdBy: "user-1",
    embeddingModel: "text-embedding-3-small",
    embeddingModelConfigId: null,
    chunkingStrategy: {
      type: "sentence_window",
      windowSize: 3,
    },
    retrievalStrategy: {
      topK: 8,
      similarityThreshold: null,
    },
    rerankingStrategy: {
      type: "none",
    },
    queryOrchestration: {
      type: "none",
    },
    documentCount: 0,
    nodeCount: 0,
    chunkCount: 0,
    status: "empty",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// --- Setup ---

function setupMocks(
  overrides: {
    knowledgeBases?: KnowledgeBase[];
    allKnowledgeBases?: KnowledgeBase[];
    isLoading?: boolean;
    isAllKnowledgeBasesLoading?: boolean;
    error?: Error | null;
    allKnowledgeBasesError?: Error | null;
  } = {},
) {
  const {
    knowledgeBases = [],
    allKnowledgeBases = knowledgeBases,
    isLoading = false,
    isAllKnowledgeBasesLoading = false,
    error = null,
    allKnowledgeBasesError = null,
  } = overrides;
  const mutateFn = vi.fn();
  const deleteFn = vi.fn();

  mocks.useKnowledgeBases.mockReturnValue({
    data: {
      data: knowledgeBases,
      meta: {
        page: 1,
        pageSize: 20,
        total: knowledgeBases.length,
        totalPages: Math.max(1, Math.ceil(knowledgeBases.length / 20)),
      },
    },
    isLoading,
    error,
    refetch: vi.fn(),
  });
  mocks.useCreateKnowledgeBase.mockReturnValue({
    mutate: mutateFn,
    isPending: false,
  });
  mocks.useAllKnowledgeBases.mockImplementation(
    ({ enabled }: { enabled?: boolean } = {}) => ({
      data: enabled ? allKnowledgeBases : undefined,
      isLoading: enabled ? isAllKnowledgeBasesLoading : false,
      error: enabled ? allKnowledgeBasesError : null,
      refetch: vi.fn(),
    }),
  );
  mocks.useDeleteKnowledgeBase.mockReturnValue({
    mutate: deleteFn,
  });

  return { mutateFn, deleteFn };
}

// --- Tests ---

describe("KnowledgeBasesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("显示加载状态", () => {
    setupMocks({ isLoading: true });
    render(<KnowledgeBasesPage />);
    expect(
      screen.getAllByTestId("knowledge-base-card-skeleton").length,
    ).toBeGreaterThan(0);
  });

  it("显示错误信息", () => {
    setupMocks({ error: new Error("网络错误") });
    render(<KnowledgeBasesPage />);
    expect(screen.getByText(/加载知识库失败/)).toBeInTheDocument();
    expect(screen.getByText(/网络错误/)).toBeInTheDocument();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "知识库列表加载失败",
        variant: "error",
      }),
    );
  });

  it("显示空状态提示", () => {
    setupMocks({ knowledgeBases: [] });
    render(<KnowledgeBasesPage />);
    expect(
      screen.getByText("还没有自己创建的知识库，点击上方按钮创建"),
    ).toBeInTheDocument();
  });

  it("默认显示顶部来源分类并按自己创建过滤", () => {
    setupMocks({ knowledgeBases: [createKnowledgeBase()] });
    render(<KnowledgeBasesPage />);

    expect(
      screen.getByRole("button", { name: "自己创建" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "分享导入" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("自己创建")).toHaveLength(1);
    expect(mocks.useKnowledgeBases).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: "manual" }),
    );
    expect(mocks.useAllKnowledgeBases).toHaveBeenCalledWith({
      enabled: false,
      sourceKind: "manual",
    });
  });

  it("渲染知识库卡片列表", () => {
    const kbs = [
      createKnowledgeBase({
        id: "kb-1",
        name: "知识库A",
        description: "描述A",
        documentCount: 3,
        nodeCount: 12,
        chunkCount: 12,
        status: "ready",
      }),
      createKnowledgeBase({
        id: "kb-2",
        name: "知识库B",
        description: "描述B",
        visibility: "organization",
        documentCount: 1,
        nodeCount: 4,
        chunkCount: 4,
        status: "processing",
      }),
    ];
    setupMocks({ knowledgeBases: kbs });
    render(<KnowledgeBasesPage />);

    expect(screen.getByText("知识库A")).toBeInTheDocument();
    expect(screen.getByText("描述A")).toBeInTheDocument();
    expect(screen.getByText("知识库B")).toBeInTheDocument();
    expect(screen.getByText("描述B")).toBeInTheDocument();
    expect(screen.getByText("3 个文档")).toBeInTheDocument();
    expect(screen.getByText("12 个知识节点")).toBeInTheDocument();
    expect(screen.getByText("私有")).toBeInTheDocument();
    expect(screen.getByText("组织")).toBeInTheDocument();
    expect(screen.getByText("可用")).toBeInTheDocument();
    expect(screen.getByText("处理中")).toBeInTheDocument();
    expect(screen.getAllByText("Sentence Window · 3").length).toBeGreaterThan(
      0,
    );
  });

  it("搜索过滤知识库", async () => {
    const kbs = [
      createKnowledgeBase({ id: "kb-1", name: "Alpha文档" }),
      createKnowledgeBase({ id: "kb-2", name: "Beta资料" }),
    ];
    setupMocks({ knowledgeBases: kbs });
    render(<KnowledgeBasesPage />);

    const searchInput = screen.getByPlaceholderText("搜索知识库...");
    await userEvent.type(searchInput, "Alpha");

    expect(screen.getByText("Alpha文档")).toBeInTheDocument();
    expect(screen.queryByText("Beta资料")).not.toBeInTheDocument();
  });

  it("搜索时会跨分页检索全部知识库", async () => {
    setupMocks({
      knowledgeBases: [createKnowledgeBase({ id: "kb-2", name: "Beta资料" })],
      allKnowledgeBases: [
        createKnowledgeBase({ id: "kb-1", name: "Alpha文档" }),
        createKnowledgeBase({ id: "kb-2", name: "Beta资料" }),
      ],
    });
    render(<KnowledgeBasesPage />);

    expect(mocks.useAllKnowledgeBases).toHaveBeenCalledWith({
      enabled: false,
      sourceKind: "manual",
    });

    const searchInput = screen.getByPlaceholderText("搜索知识库...");
    await userEvent.type(searchInput, "Alpha");

    expect(mocks.useAllKnowledgeBases).toHaveBeenLastCalledWith({
      enabled: true,
      sourceKind: "manual",
    });
    expect(screen.getByText("Alpha文档")).toBeInTheDocument();
    expect(screen.queryByText("Beta资料")).not.toBeInTheDocument();
  });

  it("点击顶部来源分类后会切换为分享导入", async () => {
    setupMocks({ knowledgeBases: [] });
    render(<KnowledgeBasesPage />);

    await userEvent.click(screen.getByRole("button", { name: "分享导入" }));

    expect(mocks.useKnowledgeBases).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceKind: "share_imported" }),
    );
    expect(mocks.useAllKnowledgeBases).toHaveBeenLastCalledWith({
      enabled: false,
      sourceKind: "share_imported",
    });
  });

  it("搜索无结果时显示提示", async () => {
    setupMocks({ knowledgeBases: [createKnowledgeBase()] });
    render(<KnowledgeBasesPage />);

    const searchInput = screen.getByPlaceholderText("搜索知识库...");
    await userEvent.type(searchInput, "不存在的内容");

    expect(screen.getByText("没有匹配的知识库")).toBeInTheDocument();
  });

  it("点击卡片导航到详情页", async () => {
    const kb = createKnowledgeBase({ id: "kb-123", name: "测试KB" });
    setupMocks({ knowledgeBases: [kb] });
    render(<KnowledgeBasesPage />);

    await userEvent.click(screen.getByText("测试KB"));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/resources/knowledge-bases/$knowledgeBaseId",
      params: { knowledgeBaseId: "kb-123" },
    });
  });

  it("打开和关闭创建对话框", async () => {
    setupMocks();
    render(<KnowledgeBasesPage />);

    // 打开对话框
    await userEvent.click(screen.getByText("创建知识库"));
    expect(
      screen.getByRole("dialog", { name: "创建知识库" }),
    ).toBeInTheDocument();

    // 关闭对话框：DialogContent 有退场动画，需等待卸载完成
    await userEvent.click(screen.getByText("取消"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("创建知识库时调用 mutation", async () => {
    const { mutateFn } = setupMocks();
    render(<KnowledgeBasesPage />);

    // 打开对话框
    await userEvent.click(screen.getByText("创建知识库"));

    // 填写表单
    await userEvent.type(
      screen.getByPlaceholderText("输入知识库名称"),
      "新知识库",
    );
    await userEvent.type(
      screen.getByPlaceholderText("输入描述（可选）"),
      "新描述",
    );

    // 提交：页头触发按钮叫「创建知识库」，对话框内提交按钮叫「创建」
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    expect(mutateFn).toHaveBeenCalledWith(
      { name: "新知识库", description: "新描述" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    const mutateOptions = mutateFn.mock.calls[0]?.[1];
    expect(mutateOptions).toBeDefined();

    if (!mutateOptions?.onSuccess) {
      throw new Error("创建知识库 mutation 缺少 onSuccess 回调");
    }

    const onSuccess = mutateOptions.onSuccess as (
      knowledgeBase: KnowledgeBase,
    ) => void;
    act(() => {
      onSuccess(createKnowledgeBase({ id: "kb-new" }));
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/resources/knowledge-bases/$knowledgeBaseId",
      params: { knowledgeBaseId: "kb-new" },
    });
  });

  it("创建按钮在名称为空时禁用", async () => {
    setupMocks();
    render(<KnowledgeBasesPage />);

    await userEvent.click(screen.getByText("创建知识库"));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "创建" }),
    ).toBeDisabled();
  });

  it("删除知识库时调用 mutation", async () => {
    const kb = createKnowledgeBase({ id: "kb-del" });
    const { deleteFn } = setupMocks({ knowledgeBases: [kb] });
    render(<KnowledgeBasesPage />);

    // 点击删除按钮打开确认对话框
    await userEvent.click(screen.getByLabelText("删除 测试知识库"));

    // Radix Dialog 应该出现
    expect(screen.getByText("删除知识库")).toBeInTheDocument();
    expect(
      screen.getByText(/确认删除知识库「测试知识库」吗/),
    ).toBeInTheDocument();

    // 点击确认删除按钮
    await userEvent.click(screen.getByText("确认删除"));

    expect(deleteFn).toHaveBeenCalledWith(
      "kb-del",
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });
});
