import { describe, expect, it } from "vitest";
import {
  parseQqTarget,
  formatQqTarget,
  normalizeAllowEntry,
  stripQqPrefix,
} from "./targets.js";

describe("stripQqPrefix", () => {
  it("removes qq: prefix", () => {
    expect(stripQqPrefix("qq:123456")).toBe("123456");
  });

  it("removes QQ: prefix case-insensitively", () => {
    expect(stripQqPrefix("QQ:123456")).toBe("123456");
  });

  it("trims whitespace", () => {
    expect(stripQqPrefix("  qq:123  ")).toBe("123");
  });

  it("returns unchanged if no prefix", () => {
    expect(stripQqPrefix("123456")).toBe("123456");
  });
});

describe("parseQqTarget", () => {
  it("parses private user by ID", () => {
    expect(parseQqTarget("123456")).toEqual({ kind: "private", id: "123456" });
  });

  it("parses qq: prefixed ID as private", () => {
    expect(parseQqTarget("qq:123456")).toEqual({ kind: "private", id: "123456" });
  });

  it("parses group: prefixed target", () => {
    expect(parseQqTarget("group:789")).toEqual({ kind: "group", id: "789" });
  });

  it("parses g: prefixed target as group", () => {
    expect(parseQqTarget("g:789")).toEqual({ kind: "group", id: "789" });
  });

  it("parses user: prefixed target as private", () => {
    expect(parseQqTarget("user:123")).toEqual({ kind: "private", id: "123" });
  });

  it("parses qq:group: prefixed target", () => {
    expect(parseQqTarget("qq:group:789")).toEqual({ kind: "group", id: "789" });
  });

  it("returns null for empty string", () => {
    expect(parseQqTarget("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(parseQqTarget("   ")).toBeNull();
  });

  it("handles whitespace around input", () => {
    expect(parseQqTarget("  123456  ")).toEqual({ kind: "private", id: "123456" });
  });
});

describe("formatQqTarget", () => {
  it("formats private target as just ID", () => {
    expect(formatQqTarget({ kind: "private", id: "123456" })).toBe("123456");
  });

  it("formats group target with group: prefix", () => {
    expect(formatQqTarget({ kind: "group", id: "789" })).toBe("group:789");
  });
});

describe("normalizeAllowEntry", () => {
  it("normalizes plain ID", () => {
    expect(normalizeAllowEntry("123456")).toBe("123456");
  });

  it("normalizes qq: prefixed ID", () => {
    expect(normalizeAllowEntry("qq:123456")).toBe("123456");
  });

  it("normalizes group: prefixed entry", () => {
    expect(normalizeAllowEntry("group:789")).toBe("group:789");
  });

  it("normalizes g: to group:", () => {
    expect(normalizeAllowEntry("g:789")).toBe("group:789");
  });

  it("normalizes user: prefixed entry", () => {
    expect(normalizeAllowEntry("user:123")).toBe("123");
  });

  it("normalizes qq:group: prefixed entry", () => {
    expect(normalizeAllowEntry("qq:group:789")).toBe("group:789");
  });

  it("handles whitespace", () => {
    expect(normalizeAllowEntry("  qq:123  ")).toBe("123");
  });
});
