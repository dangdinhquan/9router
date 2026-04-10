import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelRow } from "../../src/app/(dashboard)/dashboard/providers/components/ModelsCard.js";
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

  it("renders token size and capability labels in model row", () => {
    const html = renderToStaticMarkup(
      React.createElement(ModelRow, {
        model: { id: "gpt-5.4", contextWindow: 200000, capabilities: ["vision", "tools"] },
        fullModel: "openai/gpt-5.4",
        copied: "",
        onCopy: () => {},
      }),
    );
    expect(html).toContain("200k");
    expect(html).toContain("Vision");
    expect(html).toContain("Tools");
  });

  it("renders subtle fallback when metadata is missing", () => {
    const html = renderToStaticMarkup(
      React.createElement(ModelRow, {
        model: { id: "unknown-model" },
        fullModel: "openai/unknown-model",
        copied: "",
        onCopy: () => {},
      }),
    );
    expect(html).toContain("—");
  });
});
