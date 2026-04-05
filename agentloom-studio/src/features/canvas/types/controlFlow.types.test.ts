import { describe, expect, it } from "vitest";
import {
  buildIterationStartOutputPorts,
  buildLoopStartOutputPorts,
  createDefaultIterationStartNodeConfig,
  createDefaultLoopStartNodeConfig,
} from "./controlFlow.types";

describe("controlFlow.types compound start ports", () => {
  it("mirrors loop start passthrough labels from the parent compound inputs", () => {
    const ports = buildLoopStartOutputPorts(
      ["input-0"],
      createDefaultLoopStartNodeConfig(),
      { "input-0": "主人需求" },
    );

    expect(ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "input-0",
          label: "主人需求",
          direction: "output",
        }),
      ]),
    );
  });

  it("mirrors iteration start passthrough labels from the parent compound inputs", () => {
    const ports = buildIterationStartOutputPorts(
      ["input-2"],
      createDefaultIterationStartNodeConfig(),
      { "input-2": "外部上下文" },
    );

    expect(ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "input-2",
          label: "外部上下文",
          direction: "output",
        }),
      ]),
    );
  });
});
