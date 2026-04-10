import { describe, expect, it } from "vitest";
import { formatContextWindow, getCapabilityDisplay } from "../../src/shared/utils/modelCatalogPresentation.js";

describe("models metadata rendering", () => {
  it("formats token size as compact value", () => {
    expect(formatContextWindow(200000)).toBe("200k");
  });

  it("maps known capability to icon metadata", () => {
    const display = getCapabilityDisplay("vision");
    expect(display.icon).toBe("visibility");
    expect(display.label).toBe("Vision");
  });

  it("returns label/icon metadata used by UI capability chips", () => {
    const vision = getCapabilityDisplay("vision");
    const tools = getCapabilityDisplay("tools");
    expect(vision.label).toBe("Vision");
    expect(vision.icon).toBe("visibility");
    expect(tools.label).toBe("Tools");
    expect(tools.icon).toBe("build");
  });

  it("returns placeholder for missing token metadata", () => {
    expect(formatContextWindow(undefined)).toBe("—");
    expect(formatContextWindow(null)).toBe("—");
  });
});
