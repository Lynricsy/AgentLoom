import type {
  FileTreeNode,
  PreparationPhase,
  SandboxStatus,
  WorkspaceViewSource,
} from "../types";
import { isRecord, readString } from "./conversation-normalizers";

/**
 * 工作区文件树“是否视为实时”判定所需的会话状态子集。
 */
export interface WorkspaceTreeLivenessState {
  workspaceSource: WorkspaceViewSource;
  sandboxStatus: SandboxStatus;
  preparationPhase: PreparationPhase | null;
  fileChanges: readonly unknown[];
  terminalEntries: readonly unknown[];
  hasHistoricalMessages: boolean;
}

export function fileExistsInTree(tree: FileTreeNode[], path: string): boolean {
  for (const node of tree) {
    if (node.path === path) {
      return true;
    }
    if (node.children && fileExistsInTree(node.children, path)) {
      return true;
    }
  }

  return false;
}

export function normalizeFileTreeNode(value: unknown): FileTreeNode | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = readString(value.name);
  const path = readString(value.path);
  const type =
    value.type === "directory"
      ? "directory"
      : value.type === "file"
        ? "file"
        : null;

  if (!name || !path || !type) {
    return null;
  }

  return {
    name,
    path,
    type,
    ...(type === "directory"
      ? { children: normalizeFileTree(value.children) }
      : {}),
  };
}

export function normalizeFileTree(value: unknown): FileTreeNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const node = normalizeFileTreeNode(item);
    return node ? [node] : [];
  });
}

export function shouldTreatWorkspaceTreeAsLive(
  state: WorkspaceTreeLivenessState,
  tree: FileTreeNode[],
): boolean {
  if (tree.length > 0) {
    return true;
  }

  return (
    state.workspaceSource === "live" ||
    state.sandboxStatus === "running" ||
    state.preparationPhase === "running" ||
    state.fileChanges.length > 0 ||
    state.terminalEntries.length > 0 ||
    state.hasHistoricalMessages
  );
}

export function updateFileTreeFromChange(
  tree: FileTreeNode[],
  filePath: string,
  changeType: "created" | "modified" | "deleted",
): void {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length === 0) return;

  if (changeType === "deleted") {
    const parentParts = parts.slice(0, -1);
    const fileName = parts[parts.length - 1];
    let current = tree;
    for (const part of parentParts) {
      const dir = current.find(
        (n) => n.name === part && n.type === "directory",
      );
      if (!dir?.children) return;
      current = dir.children;
    }
    const idx = current.findIndex((n) => n.name === fileName);
    if (idx >= 0) current.splice(idx, 1);
    return;
  }

  let current = tree;
  let currentPath = "";
  for (let i = 0; i < parts.length - 1; i++) {
    const partName = parts[i] as string;
    currentPath += "/" + partName;
    let dir = current.find(
      (n) => n.name === partName && n.type === "directory",
    );
    if (!dir) {
      dir = {
        name: partName,
        path: currentPath,
        type: "directory",
        children: [],
      };
      current.push(dir);
    }
    if (!dir.children) dir.children = [];
    current = dir.children;
  }

  const fileName = parts[parts.length - 1] as string;
  const fullPath = currentPath + "/" + fileName;
  const exists = current.find((n) => n.name === fileName);
  if (!exists) {
    current.push({ name: fileName, path: fullPath, type: "file" });
  }
}
