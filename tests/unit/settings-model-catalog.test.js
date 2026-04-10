import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

describe("settings model catalog persistence", () => {
  const originalHome = process.env.HOME;
  const originalAppData = process.env.APPDATA;
  let tempHome = "";

  beforeEach(async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "router-settings-"));
    process.env.HOME = tempHome;
    process.env.APPDATA = "";
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.APPDATA = originalAppData;
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("persists dynamic catalog settings and clamps TTL bounds", async () => {
    const { updateSettings, getSettings } = await import("../../src/lib/localDb.js");

    await updateSettings({
      ENABLE_DYNAMIC_MODEL_CATALOG: false,
      MODEL_CATALOG_TTL_MINUTES: 1,
    });

    let settings = await getSettings();
    expect(settings.ENABLE_DYNAMIC_MODEL_CATALOG).toBe(false);
    expect(settings.MODEL_CATALOG_TTL_MINUTES).toBe(5);

    await updateSettings({ MODEL_CATALOG_TTL_MINUTES: 20000 });
    settings = await getSettings();
    expect(settings.MODEL_CATALOG_TTL_MINUTES).toBe(10080);
  });
});
