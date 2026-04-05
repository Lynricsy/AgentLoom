import { describe, expect, it } from "vitest";

import { NODE_TYPE_REGISTRY, PORT_DATA_TYPE_META } from "../nodeTypeRegistry";
import { PORT_DATA_TYPES } from "../typeSchema";

describe("skill 注册验证", () => {
  describe("PORT_DATA_TYPES", () => {
    it("包含 skill 数据类型", () => {
      expect(PORT_DATA_TYPES).toContain("skill");
    });

    it("共 14 种端口数据类型", () => {
      expect(PORT_DATA_TYPES).toHaveLength(14);
    });

    it("包含所有 canonical 数据类型", () => {
      const expected = [
        "model",
        "text",
        "json",
        "array",
        "image",
        "audio",
        "tool",
        "sandbox",
        "knowledge",
        "skill",
        "agent",
        "memory",
        "exec",
        "volume",
      ];
      expect(PORT_DATA_TYPES).toEqual(expected);
    });
  });

  describe("PORT_DATA_TYPE_META", () => {
    it("包含 skill 元数据", () => {
      expect(PORT_DATA_TYPE_META).toHaveProperty("skill");
    });

    it("skill 元数据有正确的 label 和 colorToken", () => {
      const skillMeta = PORT_DATA_TYPE_META.skill;
      expect(skillMeta).toBeDefined();
      expect(skillMeta.label).toBeTruthy();
      expect(skillMeta.colorToken).toBeTruthy();
    });
  });

  describe("NODE_TYPE_REGISTRY — skill 节点", () => {
    it("包含 skill 注册条目", () => {
      expect(NODE_TYPE_REGISTRY).toHaveProperty("skill");
    });

    it("skill 节点属于 agent 分类", () => {
      expect(NODE_TYPE_REGISTRY.skill.category).toBe("agent");
    });

    it("skill 节点 label 为 Skill", () => {
      expect(NODE_TYPE_REGISTRY.skill.label).toBe("Skill");
    });

    it("skill 节点 icon 为 BookOpenText", () => {
      expect(NODE_TYPE_REGISTRY.skill.icon).toBe("BookOpenText");
    });

    it("skill 节点有正确的 colorToken", () => {
      expect(NODE_TYPE_REGISTRY.skill.colorToken).toBe(
        "var(--color-type-skill)",
      );
    });

    it("skill 节点包含 exec-in 与 skill-out 所需的执行端口", () => {
      const { inputPorts } = NODE_TYPE_REGISTRY.skill;
      expect(inputPorts).toHaveLength(1);
      expect(inputPorts[0]?.id).toBe("exec-in");
      expect(inputPorts[0]?.dataType).toBe("exec");
    });

    it("skill 节点有 exec-out 与 skill-out 两个输出端口", () => {
      const { outputPorts } = NODE_TYPE_REGISTRY.skill;
      expect(outputPorts).toHaveLength(2);
      expect(outputPorts[0]?.id).toBe("exec-out");
      expect(outputPorts[0]?.dataType).toBe("exec");
      const skillOutputPort = outputPorts[1];
      expect(skillOutputPort).toBeDefined();
      expect(skillOutputPort?.id).toBe("skill-out");
      expect(skillOutputPort?.dataType).toBe("skill");
    });

    it("skill 节点 configSchema 必填 skillId", () => {
      const { configSchema } = NODE_TYPE_REGISTRY.skill;
      expect(configSchema).toBeDefined();
      expect(configSchema.properties).toHaveProperty("skillId");
      expect(configSchema.required).toContain("skillId");
    });
  });

  describe("NODE_TYPE_REGISTRY — agent 节点", () => {
    it("agent 节点存在", () => {
      expect(NODE_TYPE_REGISTRY).toHaveProperty("agent");
    });

    it("agent 节点有 skills-in 输入端口", () => {
      const skillsPort = NODE_TYPE_REGISTRY["agent"].inputPorts.find(
        (p) => p.id === "skills-in",
      );
      expect(skillsPort).toBeDefined();
      expect(skillsPort?.dataType).toBe("skill");
      expect(skillsPort?.multiple).toBe(true);
    });
  });
});
