import { describe, expect, it } from "vitest";
import { parseCqSegments, renderCqSegments, buildCqMessage } from "./cqcode.js";

describe("parseCqSegments", () => {
  it("parses plain text", () => {
    const segments = parseCqSegments("hello world");
    expect(segments).toEqual([{ type: "text", data: { text: "hello world" } }]);
  });

  it("parses CQ:at segment", () => {
    const segments = parseCqSegments("[CQ:at,qq=123456]");
    expect(segments).toEqual([{ type: "at", data: { qq: "123456" } }]);
  });

  it("parses CQ:at with qq=all", () => {
    const segments = parseCqSegments("[CQ:at,qq=all]");
    expect(segments).toEqual([{ type: "at", data: { qq: "all" } }]);
  });

  it("parses CQ:reply segment", () => {
    const segments = parseCqSegments("[CQ:reply,id=12345]");
    expect(segments).toEqual([{ type: "reply", data: { id: "12345" } }]);
  });

  it("parses CQ:image segment", () => {
    const segments = parseCqSegments("[CQ:image,file=https://example.com/image.jpg]");
    expect(segments).toEqual([{ type: "image", data: { file: "https://example.com/image.jpg" } }]);
  });

  it("parses CQ:record segment", () => {
    const segments = parseCqSegments("[CQ:record,file=audio.mp3]");
    expect(segments).toEqual([{ type: "record", data: { file: "audio.mp3" } }]);
  });

  it("parses CQ:video segment", () => {
    const segments = parseCqSegments("[CQ:video,file=video.mp4]");
    expect(segments).toEqual([{ type: "video", data: { file: "video.mp4" } }]);
  });

  it("parses mixed text and CQ codes", () => {
    const segments = parseCqSegments("Hello [CQ:at,qq=123] world");
    expect(segments).toEqual([
      { type: "text", data: { text: "Hello " } },
      { type: "at", data: { qq: "123" } },
      { type: "text", data: { text: " world" } },
    ]);
  });

  it("parses multiple CQ codes", () => {
    const segments = parseCqSegments("[CQ:reply,id=1][CQ:at,qq=123]text");
    expect(segments).toEqual([
      { type: "reply", data: { id: "1" } },
      { type: "at", data: { qq: "123" } },
      { type: "text", data: { text: "text" } },
    ]);
  });

  it("handles empty string", () => {
    const segments = parseCqSegments("");
    expect(segments).toEqual([]);
  });
});

describe("renderCqSegments", () => {
  it("renders text segment", () => {
    const result = renderCqSegments([{ type: "text", data: { text: "hello" } }]);
    expect(result.text).toBe("hello");
    expect(result.mentions).toEqual([]);
  });

  it("extracts mentions from at segments", () => {
    const result = renderCqSegments([
      { type: "text", data: { text: "Hi " } },
      { type: "at", data: { qq: "123456" } },
    ]);
    expect(result.text).toBe("Hi @123456");
    expect(result.mentions).toEqual(["123456"]);
  });

  it("handles @all mention", () => {
    const result = renderCqSegments([{ type: "at", data: { qq: "all" } }]);
    expect(result.text).toBe("@all");
    expect(result.mentions).toEqual(["all"]);
  });

  it("extracts replyToId from reply segment", () => {
    const result = renderCqSegments([
      { type: "reply", data: { id: "12345" } },
      { type: "text", data: { text: "response" } },
    ]);
    expect(result.replyToId).toBe("12345");
    expect(result.text).toBe("response");
  });

  it("renders image attachment", () => {
    const result = renderCqSegments([
      { type: "image", data: { url: "https://example.com/img.png" } },
    ]);
    expect(result.text).toBe("Attachment: https://example.com/img.png");
  });

  it("renders record attachment", () => {
    const result = renderCqSegments([
      { type: "record", data: { file: "audio.silk" } },
    ]);
    expect(result.text).toBe("Attachment: audio.silk");
  });

  it("renders video attachment", () => {
    const result = renderCqSegments([
      { type: "video", data: { file: "video.mp4" } },
    ]);
    expect(result.text).toBe("Attachment: video.mp4");
  });
});

describe("buildCqMessage", () => {
  it("builds text-only message", () => {
    const result = buildCqMessage({ text: "hello" });
    expect(result).toBe("hello");
  });

  it("builds message with reply", () => {
    const result = buildCqMessage({ text: "response", replyToId: "123" });
    expect(result).toBe("[CQ:reply,id=123]response");
  });

  it("builds message with image", () => {
    const result = buildCqMessage({ mediaUrl: "https://example.com/img.png" });
    expect(result).toBe("[CQ:image,file=https://example.com/img.png]");
  });

  it("builds message with record", () => {
    const result = buildCqMessage({ mediaUrl: "audio.mp3", mediaType: "record" });
    expect(result).toBe("[CQ:record,file=audio.mp3]");
  });

  it("builds message with video", () => {
    const result = buildCqMessage({ mediaUrl: "video.mp4", mediaType: "video" });
    expect(result).toBe("[CQ:video,file=video.mp4]");
  });

  it("builds complete message with reply, text, and media", () => {
    const result = buildCqMessage({
      text: "check this",
      replyToId: "100",
      mediaUrl: "image.jpg",
      mediaType: "image",
    });
    expect(result).toBe("[CQ:reply,id=100]check this[CQ:image,file=image.jpg]");
  });
});
