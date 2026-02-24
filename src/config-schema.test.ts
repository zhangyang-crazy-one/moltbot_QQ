import { describe, expect, it } from "vitest";
import { QQConfigSchema } from "./config-schema.js";

describe("QQConfigSchema connection types", () => {
  it("accepts ws/http connections with optional secure flag", () => {
    const ws = QQConfigSchema.safeParse({
      enabled: true,
      connection: {
        type: "ws",
        host: "127.0.0.1",
        port: 8080,
        secure: true,
      },
    });
    const http = QQConfigSchema.safeParse({
      enabled: true,
      connection: {
        type: "http",
        host: "127.0.0.1",
        port: 3000,
        secure: true,
      },
    });
    expect(ws.success).toBe(true);
    expect(http.success).toBe(true);
  });

  it("rejects deprecated http-post/ws-reverse connection types", () => {
    const httpPost = QQConfigSchema.safeParse({
      connection: {
        type: "http-post",
        url: "https://example.com/qq",
      },
    });
    const wsReverse = QQConfigSchema.safeParse({
      connection: {
        type: "ws-reverse",
        url: "wss://example.com/qq",
      },
    });
    expect(httpPost.success).toBe(false);
    expect(wsReverse.success).toBe(false);
  });
});
