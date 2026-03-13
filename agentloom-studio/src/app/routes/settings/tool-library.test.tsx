import { describe, expect, it } from "vitest";
import { toolLibraryRoute } from "./tool-library";

describe("toolLibraryRoute", () => {
  it("mounts the tool library page on /settings/tool-library", () => {
    expect(toolLibraryRoute.options).toMatchObject({
      path: "/settings/tool-library",
    });
  });
});
