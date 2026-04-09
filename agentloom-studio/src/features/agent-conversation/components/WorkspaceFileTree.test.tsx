import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import type { FileTreeNode } from "../types";

function makeTree(): FileTreeNode[] {
  return [
    {
      name: "src",
      type: "directory",
      path: "src",
      children: [
        { name: "index.ts", type: "file", path: "src/index.ts" },
      ],
    },
    { name: "readme.md", type: "file", path: "readme.md" },
  ];
}

describe("WorkspaceFileTree", () => {
  it("tree 为空且未加载时显示 '暂无文件'", () => {
    render(
      <WorkspaceFileTree tree={[]} selectedPath={null} onSelectFile={() => {}} />,
    );
    expect(screen.getByText("暂无文件")).toBeInTheDocument();
  });

  it("isLoading=true 且 tree 为空时显示骨架屏而非 '暂无文件'", () => {
    render(
      <WorkspaceFileTree
        tree={[]}
        selectedPath={null}
        onSelectFile={() => {}}
        isLoading
      />,
    );
    expect(screen.queryByText("暂无文件")).not.toBeInTheDocument();
    expect(screen.getByText("工作区")).toBeInTheDocument();
  });

  it("isLoading=true 但 tree 已有数据时正常显示文件树", () => {
    render(
      <WorkspaceFileTree
        tree={makeTree()}
        selectedPath={null}
        onSelectFile={() => {}}
        isLoading
      />,
    );
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(screen.queryByText("暂无文件")).not.toBeInTheDocument();
  });

  it("tree 有数据且 isLoading=false 时正常显示文件树", () => {
    render(
      <WorkspaceFileTree
        tree={makeTree()}
        selectedPath={null}
        onSelectFile={() => {}}
      />,
    );
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });
});
