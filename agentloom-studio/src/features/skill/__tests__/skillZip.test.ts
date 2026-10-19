import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { extractSkillZip } from "../lib/skillZip";

async function loadZip(files: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return new JSZip().loadAsync(await zip.generateAsync({ type: "uint8array" }));
}

describe("extractSkillZip", () => {
  it("附件保留相对 SKILL.md 所在目录的路径，不拍平子目录", async () => {
    const zip = await loadZip({
      "my-skill/SKILL.md": "---\nname: my-skill\n---\n# Body",
      "my-skill/scripts/run.sh": "echo hi",
      "my-skill/references/guide.md": "# Guide",
      "my-skill/a/x.md": "aaa",
      "my-skill/b/x.md": "bbbbb",
      "__MACOSX/my-skill/._SKILL.md": "junk",
    });

    const result = await extractSkillZip(zip);

    expect(result.skillMdContent).toContain("# Body");
    expect(result.attachments.map((file) => file.name).sort()).toEqual([
      "a/x.md",
      "b/x.md",
      "references/guide.md",
      "scripts/run.sh",
    ]);
  });

  it("根目录的 SKILL.md 作为技能根，嵌套的 SKILL.md 作为附件", async () => {
    const zip = await loadZip({
      "SKILL.md": "# Root",
      "examples/SKILL.md": "# Example",
    });

    const result = await extractSkillZip(zip);

    expect(result.skillMdContent).toBe("# Root");
    expect(result.attachments.map((file) => file.name)).toEqual([
      "examples/SKILL.md",
    ]);
  });

  it("缺少 SKILL.md 时返回 null", async () => {
    const zip = await loadZip({ "notes.md": "x" });

    const result = await extractSkillZip(zip);

    expect(result.skillMdContent).toBeNull();
  });
});
