import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandboxPresetSelector } from "./SandboxPresetSelector";

const mocks = vi.hoisted(() => ({
  customPresets: [] as Array<{
    id: string;
    name: string;
    cpu: number;
    memory: number;
    disk: number;
    isBuiltin: boolean;
  }>,
  removePreset: vi.fn(),
  renamePreset: vi.fn(),
}));

vi.mock("../stores/sandboxPresetStore", async () => {
  const actual = await vi.importActual<
    typeof import("../stores/sandboxPresetStore")
  >("../stores/sandboxPresetStore");

  return {
    ...actual,
    useSandboxPresetStore: (
      selector: (state: {
        customPresets: typeof mocks.customPresets;
        removePreset: typeof mocks.removePreset;
        renamePreset: typeof mocks.renamePreset;
      }) => unknown,
    ) =>
      selector({
        customPresets: mocks.customPresets,
        removePreset: mocks.removePreset,
        renamePreset: mocks.renamePreset,
      }),
  };
});

describe("SandboxPresetSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customPresets = [];
  });

  it("渲染内置预设并支持选择", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<SandboxPresetSelector onSelect={onSelect} />);

    expect(screen.getByText("轻量")).toBeInTheDocument();
    expect(screen.getByText("标准")).toBeInTheDocument();
    expect(screen.getByText("高性能")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /标准/ }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "builtin-standard",
        name: "标准",
        cpu: 1,
        memory: 1024,
        disk: 5,
      }),
    );
  });

  it("保存预设时使用用户输入的名称", async () => {
    const user = userEvent.setup();
    const onSaveAsPreset = vi.fn();

    render(
      <SandboxPresetSelector
        onSelect={vi.fn()}
        onSaveAsPreset={onSaveAsPreset}
        currentConfig={{ cpu: 1.5, memory: 1536, disk: 6 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存为预设" }));
    await user.type(screen.getByPlaceholderText("预设名称"), "团队默认");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSaveAsPreset).toHaveBeenCalledWith({
      name: "团队默认",
      cpu: 1.5,
      memory: 1536,
      disk: 6,
    });
  });

  it("支持重命名和删除自定义预设", async () => {
    const user = userEvent.setup();
    mocks.customPresets = [
      {
        id: "custom-1",
        name: "夜间构建",
        cpu: 2,
        memory: 2048,
        disk: 8,
        isBuiltin: false,
      },
    ];

    render(<SandboxPresetSelector onSelect={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "夜间构建 重命名" }));
    await user.clear(screen.getByPlaceholderText("重命名预设"));
    await user.type(screen.getByPlaceholderText("重命名预设"), "夜间构建 v2");
    await user.click(screen.getByRole("button", { name: "重命名" }));

    expect(mocks.renamePreset).toHaveBeenCalledWith("custom-1", "夜间构建 v2");

    await user.click(screen.getByRole("button", { name: "夜间构建 删除" }));

    expect(mocks.removePreset).toHaveBeenCalledWith("custom-1");
  });
});
