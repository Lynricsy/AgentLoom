import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const useSkillListMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
);
const useDeleteSkillMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
);
const useArchiveSkillMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
);

vi.mock("../api/skillQueries", () => ({
  useSkillList: useSkillListMock,
  useDeleteSkill: useDeleteSkillMock,
  useArchiveSkill: useArchiveSkillMock,
}));

vi.mock("../components/CreateSkillDialog", () => ({
  CreateSkillDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div data-testid="create-skill-dialog">CreateSkillDialog</div>
    ) : null,
}));

vi.mock("../components/SkillDetailDialog", () => ({
  SkillDetailDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div data-testid="skill-detail-dialog">SkillDetailDialog</div>
    ) : null,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

import type { Skill } from "../types";
import type { PaginatedResponse } from "@/shared/types/api";
import { SkillBrowsePage } from "../components/SkillBrowsePage";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    tenantId: "tenant-1",
    name: "Test Skill",
    slug: "test-skill",
    description: "A test skill description",
    content: "# Test",
    frontmatter: null,
    isBuiltin: false,
    status: "active",
    fileCount: 2,
    totalSizeBytes: 1024,
    version: 1,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T12:30:00Z",
    ...overrides,
  };
}

function makeListResponse(
  skills: Skill[],
  meta?: Partial<PaginatedResponse<Skill>["meta"]>,
): PaginatedResponse<Skill> {
  return {
    data: skills,
    meta: {
      page: 1,
      pageSize: 20,
      total: skills.length,
      totalPages: 1,
      ...meta,
    },
  };
}

function setupListReturn(
  skills: Skill[],
  meta?: Partial<PaginatedResponse<Skill>["meta"]>,
) {
  useSkillListMock.mockReturnValue({
    data: makeListResponse(skills, meta),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useSkillListMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("SkillBrowsePage", () => {
  describe("页头与标题", () => {
    it("渲染页面标题和描述", () => {
      render(<SkillBrowsePage />);
      expect(screen.getByText("技能管理")).toBeInTheDocument();
      expect(screen.getByText(/管理 Agent 可使用的技能/)).toBeInTheDocument();
    });

    it("渲染新建技能按钮", () => {
      render(<SkillBrowsePage />);
      expect(
        screen.getByRole("button", { name: "新建技能" }),
      ).toBeInTheDocument();
    });
  });

  describe("加载状态", () => {
    it("isLoading 时显示骨架占位而非列表", () => {
      useSkillListMock.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      });

      const { container } = render(<SkillBrowsePage />);
      expect(container.querySelector(".shimmer")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("错误状态", () => {
    it("isError 时显示重新加载按钮", () => {
      const refetchMock = vi.fn();
      useSkillListMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: refetchMock,
      });

      render(<SkillBrowsePage />);
      expect(screen.getByText("技能列表加载失败")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /重新加载/ });
      fireEvent.click(retryBtn);
      expect(refetchMock).toHaveBeenCalled();
    });
  });

  describe("空状态", () => {
    it('无筛选时显示"暂无技能，点击右上角新建"', () => {
      useSkillListMock.mockReturnValue({
        data: makeListResponse([]),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(<SkillBrowsePage />);
      expect(
        screen.getByText("还没有自己创建的技能，点击右上角新建"),
      ).toBeInTheDocument();
    });

    it('有搜索关键词时显示"没有匹配的技能"', async () => {
      useSkillListMock.mockReturnValue({
        data: makeListResponse([]),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(<SkillBrowsePage />);

      const searchInput = screen.getByPlaceholderText("搜索技能名称或描述...");
      await userEvent.type(searchInput, "abc");

      expect(screen.getByText("没有匹配的技能")).toBeInTheDocument();
    });
  });

  describe("技能列表", () => {
    it("默认显示顶部来源分类并按自己创建过滤", () => {
      setupListReturn([makeSkill()]);

      render(<SkillBrowsePage />);

      expect(
        screen.getByRole("button", { name: "自己创建" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "分享导入" }),
      ).toBeInTheDocument();
      expect(screen.getAllByText("自己创建")).toHaveLength(1);
      expect(useSkillListMock).toHaveBeenCalledWith(
        expect.objectContaining({ sourceKind: "manual" }),
      );
    });

    it("渲染技能名称和描述", () => {
      setupListReturn([
        makeSkill({ id: "s1", name: "Skill Alpha", description: "Desc A" }),
        makeSkill({ id: "s2", name: "Skill Beta", description: "Desc B" }),
      ]);

      render(<SkillBrowsePage />);
      expect(screen.getByText("Skill Alpha")).toBeInTheDocument();
      expect(screen.getByText("Skill Beta")).toBeInTheDocument();
      expect(screen.getByText("Desc A")).toBeInTheDocument();
      expect(screen.getByText("Desc B")).toBeInTheDocument();
      // 每张卡片的更多操作按钮带技能名，可访问名唯一（getByRole 命中多个会抛错）
      expect(
        screen.getByRole("button", { name: "Skill Alpha 的更多操作" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Skill Beta 的更多操作" }),
      ).toBeInTheDocument();
    });

    it("内置技能显示内置徽章", () => {
      setupListReturn([
        makeSkill({ id: "s1", name: "Built-in One", isBuiltin: true }),
        makeSkill({ id: "s2", name: "Custom One", isBuiltin: false }),
      ]);

      render(<SkillBrowsePage />);
      const badges = screen.getAllByText("内置");
      expect(badges).toHaveLength(1);
    });

    it('活跃技能显示"活跃"徽章，归档技能显示"已归档"', () => {
      setupListReturn([
        makeSkill({ id: "s1", name: "Active", status: "active" }),
        makeSkill({ id: "s2", name: "Archived", status: "archived" }),
      ]);

      render(<SkillBrowsePage />);

      const activeCard = screen.getByText("Active").closest("article")!;
      expect(within(activeCard).getByText("活跃")).toBeInTheDocument();

      const archivedCard = screen.getByText("Archived").closest("article")!;
      expect(within(archivedCard).getByText("已归档")).toBeInTheDocument();
    });

    it("显示文件数", () => {
      setupListReturn([makeSkill({ fileCount: 5 })]);
      render(<SkillBrowsePage />);
      expect(screen.getByText("5 个文件")).toBeInTheDocument();
    });
  });

  describe("搜索输入", () => {
    it("存在搜索 placeholder", () => {
      render(<SkillBrowsePage />);
      expect(
        screen.getByPlaceholderText("搜索技能名称或描述..."),
      ).toBeInTheDocument();
    });
  });

  describe("筛选 Select", () => {
    it("状态筛选有全部状态/活跃/已归档选项", async () => {
      render(<SkillBrowsePage />);

      await userEvent.click(screen.getByRole("combobox", { name: "状态筛选" }));

      const options = await screen.findAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual([
        "全部状态",
        "活跃",
        "已归档",
      ]);
    });

    it("类型筛选有全部类型/内置技能/自定义技能选项", async () => {
      render(<SkillBrowsePage />);

      await userEvent.click(screen.getByRole("combobox", { name: "类型筛选" }));

      const options = await screen.findAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual([
        "全部类型",
        "内置技能",
        "自定义技能",
      ]);
    });

    it("更改状态筛选会将 status 参数传入 hook", async () => {
      render(<SkillBrowsePage />);

      await userEvent.click(screen.getByRole("combobox", { name: "状态筛选" }));
      await userEvent.click(await screen.findByRole("option", { name: "活跃" }));

      expect(useSkillListMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
      );
    });

    it("更改类型筛选会将 isBuiltin 参数传入 hook", async () => {
      render(<SkillBrowsePage />);

      await userEvent.click(screen.getByRole("combobox", { name: "类型筛选" }));
      await userEvent.click(
        await screen.findByRole("option", { name: "内置技能" }),
      );

      expect(useSkillListMock).toHaveBeenCalledWith(
        expect.objectContaining({ isBuiltin: true }),
      );
    });

    it("点击顶部来源分类会切换为分享导入", async () => {
      render(<SkillBrowsePage />);

      await userEvent.click(screen.getByRole("button", { name: "分享导入" }));

      expect(useSkillListMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceKind: "share_imported" }),
      );
    });
  });

  describe("新建技能按钮", () => {
    it("点击新建按钮打开 CreateSkillDialog", async () => {
      render(<SkillBrowsePage />);

      expect(
        screen.queryByTestId("create-skill-dialog"),
      ).not.toBeInTheDocument();

      const createBtn = screen.getByRole("button", { name: "新建技能" });
      await userEvent.click(createBtn);

      expect(screen.getByTestId("create-skill-dialog")).toBeInTheDocument();
    });

    it("空列表时点击空态 CTA 也能打开 CreateSkillDialog", async () => {
      setupListReturn([]);
      render(<SkillBrowsePage />);

      // 页头 CTA 与空态 CTA 文案不同，精确名称可分别唯一命中
      expect(
        screen.getByRole("button", { name: "新建技能" }),
      ).toBeInTheDocument();
      const emptyCta = screen.getByRole("button", { name: "创建第一个技能" });

      expect(
        screen.queryByTestId("create-skill-dialog"),
      ).not.toBeInTheDocument();

      await userEvent.click(emptyCta);

      expect(screen.getByTestId("create-skill-dialog")).toBeInTheDocument();
    });
  });

  describe("行操作", () => {
    it("点击技能名称打开详情对话框", async () => {
      setupListReturn([makeSkill({ name: "ClickMe" })]);
      render(<SkillBrowsePage />);

      expect(
        screen.queryByTestId("skill-detail-dialog"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("ClickMe"));

      expect(screen.getByTestId("skill-detail-dialog")).toBeInTheDocument();
    });

    it("非内置技能的行操作菜单包含查看/编辑/归档/删除", async () => {
      setupListReturn([
        makeSkill({
          id: "sk-1",
          name: "Editable",
          isBuiltin: false,
          status: "active",
        }),
      ]);
      render(<SkillBrowsePage />);

      await userEvent.click(
        screen.getByRole("button", { name: "Editable 的更多操作" }),
      );

      await waitFor(() => {
        expect(screen.getByText("查看详情")).toBeInTheDocument();
        expect(screen.getByText("编辑")).toBeInTheDocument();
        expect(screen.getByText("归档")).toBeInTheDocument();
        expect(screen.getByText("删除")).toBeInTheDocument();
      });
    });

    it("内置技能的行操作菜单只有查看详情", async () => {
      setupListReturn([
        makeSkill({
          id: "sk-b",
          name: "BuiltinSkill",
          isBuiltin: true,
          status: "active",
        }),
      ]);
      render(<SkillBrowsePage />);

      await userEvent.click(
        screen.getByRole("button", { name: "BuiltinSkill 的更多操作" }),
      );

      await waitFor(() => {
        expect(screen.getByText("查看详情")).toBeInTheDocument();
        expect(screen.queryByText("编辑")).not.toBeInTheDocument();
        expect(screen.queryByText("删除")).not.toBeInTheDocument();
      });
    });

    it("点击删除后显示确认对话框", async () => {
      setupListReturn([
        makeSkill({
          id: "sk-d",
          name: "ToDelete",
          isBuiltin: false,
          status: "active",
        }),
      ]);
      render(<SkillBrowsePage />);

      await userEvent.click(
        screen.getByRole("button", { name: "ToDelete 的更多操作" }),
      );

      await waitFor(() => {
        expect(screen.getByText("删除")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByText("删除"));

      expect(screen.getByText("确认删除")).toBeInTheDocument();
      expect(
        screen.getByText(/确定要删除技能「ToDelete」吗/),
      ).toBeInTheDocument();
    });
  });
});
