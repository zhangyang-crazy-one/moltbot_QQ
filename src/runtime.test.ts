import { describe, expect, it, vi } from "vitest";

describe("qq runtime", () => {
  it("throws when runtime is not initialized", async () => {
    vi.resetModules();
    const runtimeModule = await import("./runtime.js");
    expect(() => runtimeModule.getQqRuntime()).toThrow("QQ runtime not initialized");
  });

  it("returns runtime after initialization", async () => {
    vi.resetModules();
    const runtimeModule = await import("./runtime.js");
    const runtime = { channel: { text: {} } } as never;
    runtimeModule.setQqRuntime(runtime);
    expect(runtimeModule.getQqRuntime()).toBe(runtime);
  });
});
