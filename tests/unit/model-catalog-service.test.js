import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockGetSettings = vi.fn();
const mockGetModelCatalogCache = vi.fn();
const mockSetModelCatalogCache = vi.fn();

vi.mock("../../src/lib/localDb.js", () => ({
  getSettings: mockGetSettings,
  getModelCatalogCache: mockGetModelCatalogCache,
  setModelCatalogCache: mockSetModelCatalogCache,
}));

describe("modelCatalogService", () => {
  const originalFetch = global.fetch;
  let service;

  beforeEach(async () => {
    vi.resetModules();
    service = await import("../../src/lib/modelCatalogService.js");
    service.__resetModelCatalogServiceForTests();
    mockGetSettings.mockResolvedValue({
      ENABLE_DYNAMIC_MODEL_CATALOG: true,
      MODEL_CATALOG_TTL_MINUTES: 720,
    });
    mockGetModelCatalogCache.mockResolvedValue({
      etag: null,
      fetchedAt: null,
      providers: {},
      lastRefreshAt: null,
      lastRefreshStatus: "idle",
      lastError: null,
    });
    mockSetModelCatalogCache.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("fetches and normalizes remote catalog successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "etag-1" },
      json: async () => ({
        providers: {
          openai: {
            models: [
              {
                id: "gpt-5.4",
                name: "GPT-5.4",
                context_window: 200000,
                max_output_tokens: 64000,
                capabilities: ["text", "tools", "reasoning"],
              },
            ],
          },
        },
      }),
    });

    const result = await service.getModelCatalog();
    const openaiModel = result.providers.openai.find((m) => m.id === "gpt-5.4");

    expect(openaiModel).toBeTruthy();
    expect(openaiModel.contextWindow).toBe(200000);
    expect(openaiModel.maxOutputTokens).toBe(64000);
    expect(openaiModel.capabilities).toContain("tools");
    expect(result.catalogMeta.lastRefreshStatus).toBe("ok");
  });

  it("falls back to static models when remote schema is invalid", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ invalid: true }),
    });

    const result = await service.getModelCatalog();

    expect(Array.isArray(result.providers.openai)).toBe(true);
    expect(result.providers.openai.length).toBeGreaterThan(0);
    expect(result.catalogMeta.lastRefreshStatus).toBe("error");
  });

  it("uses fresh TTL cache and skips redundant fetch", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        providers: { openai: { models: [{ id: "gpt-5.4", context_window: 200000 }] } },
      }),
    });

    await service.getModelCatalog();
    await service.getModelCatalog();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("serves stale cache immediately and keeps stale data when refresh fails", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    let now = 1_000_000;
    nowSpy.mockImplementation(() => now);
    mockGetSettings.mockResolvedValue({
      ENABLE_DYNAMIC_MODEL_CATALOG: true,
      MODEL_CATALOG_TTL_MINUTES: 5,
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          providers: { openai: { models: [{ id: "gpt-5.4", context_window: 123000 }] } },
        }),
      })
      .mockRejectedValueOnce(new Error("network down"));

    const fresh = await service.getModelCatalog();
    now += 6 * 60 * 1000; // stale
    const stale = await service.getModelCatalog();

    expect(stale.providers.openai.find((m) => m.id === "gpt-5.4")?.contextWindow).toBe(
      fresh.providers.openai.find((m) => m.id === "gpt-5.4")?.contextWindow,
    );

    await Promise.resolve();
    const afterFailure = await service.getModelCatalog();
    expect(afterFailure.providers.openai.find((m) => m.id === "gpt-5.4")?.contextWindow).toBe(123000);

    nowSpy.mockRestore();
  });

  it("merges dynamic metadata over static while retaining static-only fields", () => {
    const merged = service.mergeCatalogProviders(
      {
        openai: [
          {
            id: "gpt-5.4",
            name: "Static Name",
            type: "llm",
            isFree: true,
            capabilities: [],
            source: "static",
          },
        ],
      },
      {
        openai: [
          {
            id: "gpt-5.4",
            name: "Dynamic Name",
            contextWindow: 200000,
            capabilities: ["vision"],
            source: "dynamic",
          },
        ],
      },
    );

    expect(merged.openai[0].name).toBe("Dynamic Name");
    expect(merged.openai[0].contextWindow).toBe(200000);
    expect(merged.openai[0].type).toBe("llm");
    expect(merged.openai[0].isFree).toBe(true);
    expect(merged.openai[0].source).toBe("merged");
  });
});
