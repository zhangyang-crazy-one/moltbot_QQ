import { describe, expect, it } from "vitest";
import { parseOb11Message, hasSelfMention } from "./message-utils.js";
import type { OB11MessageSegment } from "./types.js";

describe("parseOb11Message", () => {
  describe("with string input (CQ code format)", () => {
    it("parses plain text", () => {
      const result = parseOb11Message("hello world");
      expect(result.text).toBe("hello world");
      expect(result.mentions).toEqual([]);
    });

    it("parses message with at mention", () => {
      const result = parseOb11Message("Hi [CQ:at,qq=123456]");
      expect(result.text).toBe("Hi @123456");
      expect(result.mentions).toEqual(["123456"]);
    });

    it("parses message with reply", () => {
      const result = parseOb11Message("[CQ:reply,id=999]response text");
      expect(result.text).toBe("response text");
      expect(result.replyToId).toBe("999");
    });
  });

  describe("with array input (segment format)", () => {
    it("parses text segments", () => {
      const segments: OB11MessageSegment[] = [
        { type: "text", data: { text: "hello" } },
      ];
      const result = parseOb11Message(segments);
      expect(result.text).toBe("hello");
    });

    it("parses at segments", () => {
      const segments: OB11MessageSegment[] = [
        { type: "text", data: { text: "Hi " } },
        { type: "at", data: { qq: "123" } },
      ];
      const result = parseOb11Message(segments);
      expect(result.text).toBe("Hi @123");
      expect(result.mentions).toEqual(["123"]);
    });

    it("parses @all mention", () => {
      const segments: OB11MessageSegment[] = [
        { type: "at", data: { qq: "all" } },
      ];
      const result = parseOb11Message(segments);
      expect(result.mentions).toEqual(["all"]);
    });

    it("parses reply segment", () => {
      const segments: OB11MessageSegment[] = [
        { type: "reply", data: { id: "456" } },
        { type: "text", data: { text: "reply content" } },
      ];
      const result = parseOb11Message(segments);
      expect(result.replyToId).toBe("456");
      expect(result.text).toBe("reply content");
    });

    it("parses image segment", () => {
      const segments: OB11MessageSegment[] = [
        { type: "image", data: { url: "https://example.com/img.png" } },
      ];
      const result = parseOb11Message(segments);
      expect(result.text).toBe("Attachment: https://example.com/img.png");
    });

    it("parses record segment", () => {
      const segments: OB11MessageSegment[] = [
        { type: "record", data: { file: "audio.silk" } },
      ];
      const result = parseOb11Message(segments);
      expect(result.text).toBe("Attachment: audio.silk");
    });

    it("parses video segment", () => {
      const segments: OB11MessageSegment[] = [
        { type: "video", data: { file: "video.mp4" } },
      ];
      const result = parseOb11Message(segments);
      expect(result.text).toBe("Attachment: video.mp4");
    });
  });

  describe("with empty/undefined input", () => {
    it("handles undefined", () => {
      const result = parseOb11Message(undefined);
      expect(result.text).toBe("");
      expect(result.mentions).toEqual([]);
    });

    it("handles empty string", () => {
      const result = parseOb11Message("");
      expect(result.text).toBe("");
      expect(result.mentions).toEqual([]);
    });

    it("handles empty array", () => {
      const result = parseOb11Message([]);
      expect(result.text).toBe("");
      expect(result.mentions).toEqual([]);
    });
  });
});

describe("hasSelfMention", () => {
  it("returns true when mentions include selfId", () => {
    expect(hasSelfMention(["123", "456"], "123")).toBe(true);
  });

  it("returns false when mentions do not include selfId", () => {
    expect(hasSelfMention(["123", "456"], "789")).toBe(false);
  });

  it("returns true when mentions include 'all'", () => {
    expect(hasSelfMention(["all"], "123")).toBe(true);
  });

  it("returns true when mentions include 'all' even without selfId", () => {
    expect(hasSelfMention(["all"], undefined)).toBe(true);
  });

  it("returns false when selfId is undefined and no 'all'", () => {
    expect(hasSelfMention(["123"], undefined)).toBe(false);
  });

  it("returns false for empty mentions", () => {
    expect(hasSelfMention([], "123")).toBe(false);
  });
});
