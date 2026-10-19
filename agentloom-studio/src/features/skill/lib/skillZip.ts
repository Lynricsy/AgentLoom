import type JSZip from "jszip";

export interface ExtractedSkillZip {
  /** 最浅一层 SKILL.md 的内容；ZIP 中没有 SKILL.md 时为 null */
  skillMdContent: string | null;
  /** 附件，文件名为相对技能根目录（SKILL.md 所在目录）的路径 */
  attachments: File[];
}

/**
 * 解析技能 ZIP 包。
 *
 * 以最浅一层的 SKILL.md 所在目录为技能根目录，附件保留相对该目录的路径，
 * 这样 SKILL.md 中引用的 `scripts/`、`references/` 等子目录上传后不会被拍平。
 */
export async function extractSkillZip(zip: JSZip): Promise<ExtractedSkillZip> {
  const entries = Object.entries(zip.files).filter(
    ([relativePath, entry]) =>
      !entry.dir &&
      !relativePath.includes("..") &&
      !relativePath.startsWith("__MACOSX/"),
  );

  const skillMdPath = entries
    .map(([relativePath]) => relativePath)
    .filter(
      (relativePath) =>
        (relativePath.split("/").pop() ?? "").toUpperCase() === "SKILL.MD",
    )
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  const rootPrefix = skillMdPath
    ? skillMdPath.slice(0, skillMdPath.length - "SKILL.md".length)
    : "";

  let skillMdContent: string | null = null;
  const attachments: File[] = [];

  for (const [relativePath, entry] of entries) {
    if (relativePath === skillMdPath) {
      skillMdContent = await entry.async("string");
      continue;
    }

    const fileName = relativePath.startsWith(rootPrefix)
      ? relativePath.slice(rootPrefix.length)
      : relativePath;
    const blob = await entry.async("blob");
    attachments.push(
      new File([blob], fileName, { type: "application/octet-stream" }),
    );
  }

  return { skillMdContent, attachments };
}
