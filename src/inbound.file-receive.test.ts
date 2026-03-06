import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { handleOb11Event } from "./inbound.js";
import { getActiveQqClient } from "./adapter.js";
import { getQqRuntime } from "./runtime.js";

vi.mock("./runtime.js", () => ({
  getQqRuntime: vi.fn(),
}));
vi.mock("./adapter.js", () => ({
  getActiveQqClient: vi.fn(),
}));

const mockGetQqRuntime = vi.mocked(getQqRuntime);
const mockGetActiveQqClient = vi.mocked(getActiveQqClient);

describe("handleOb11Event file receive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveQqClient.mockReturnValue(undefined);
  });

  it("downloads inbound file media and forwards local path in inbound context", async () => {
    const finalizeInboundContext = vi.fn((ctx) => ({
      ...ctx,
      SessionKey: ctx.SessionKey ?? "qq:test",
    }));
    const fetchRemoteMedia = vi.fn(async () => ({
      buffer: Buffer.from("pdf"),
      contentType: "application/pdf",
      fileName: "report.pdf",
    }));
    const saveMediaBuffer = vi.fn(async () => ({
      path: "/tmp/openclaw-media/inbound/report---uuid.pdf",
      contentType: "application/pdf",
      id: "report---uuid.pdf",
      size: 3,
    }));
    const core = {
      channel: {
        commands: {
          shouldHandleTextCommands: () => false,
        },
        text: {
          hasControlCommand: () => false,
        },
        routing: {
          resolveAgentRoute: () => ({
            agentId: "default",
            accountId: "default",
            sessionKey: "qq:test",
          }),
        },
        session: {
          resolveStorePath: () => "/tmp/qq-session",
          readSessionUpdatedAt: () => Date.now() - 1_000,
          recordInboundSession: async () => undefined,
        },
        media: {
          fetchRemoteMedia,
          saveMediaBuffer,
        },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          finalizeInboundContext,
          dispatchReplyWithBufferedBlockDispatcher: async () => undefined,
        },
      },
    } as never;
    mockGetQqRuntime.mockReturnValue(core);

    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as RuntimeEnv;

    await handleOb11Event({
      event: {
        post_type: "message",
        message_type: "private",
        user_id: 10001,
        message_id: 20001,
        message: [
          {
            type: "file",
            data: {
              url: "https://example.com/report.pdf",
              name: "report.pdf",
            },
          },
        ],
      },
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        connection: {},
        config: {
          dmPolicy: "open",
          groupPolicy: "allowlist",
          allowFrom: [],
          groupAllowFrom: [],
          requireMention: true,
        },
      } as never,
      config: {} as OpenClawConfig,
      runtime,
    });

    expect(finalizeInboundContext).toHaveBeenCalledTimes(1);
    const payload = finalizeInboundContext.mock.calls[0]?.[0] as
      | { MediaUrls?: string[]; BodyForAgent?: string }
      | undefined;
    expect(payload?.MediaUrls).toEqual(["/tmp/openclaw-media/inbound/report---uuid.pdf"]);
    expect(payload?.BodyForAgent).toContain("[File: report.pdf]");
    expect(fetchRemoteMedia).toHaveBeenCalledWith({
      url: "https://example.com/report.pdf",
      filePathHint: "report.pdf",
      maxBytes: 5 * 1024 * 1024,
    });
    expect(saveMediaBuffer).toHaveBeenCalled();
  });

  it("falls back to original url when media download fails", async () => {
    const finalizeInboundContext = vi.fn((ctx) => ({
      ...ctx,
      SessionKey: ctx.SessionKey ?? "qq:test",
    }));
    const fetchRemoteMedia = vi.fn(async () => {
      throw new Error("network blocked");
    });
    const saveMediaBuffer = vi.fn();
    const core = {
      channel: {
        commands: {
          shouldHandleTextCommands: () => false,
        },
        text: {
          hasControlCommand: () => false,
        },
        routing: {
          resolveAgentRoute: () => ({
            agentId: "default",
            accountId: "default",
            sessionKey: "qq:test",
          }),
        },
        session: {
          resolveStorePath: () => "/tmp/qq-session",
          readSessionUpdatedAt: () => Date.now() - 1_000,
          recordInboundSession: async () => undefined,
        },
        media: {
          fetchRemoteMedia,
          saveMediaBuffer,
        },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          finalizeInboundContext,
          dispatchReplyWithBufferedBlockDispatcher: async () => undefined,
        },
      },
    } as never;
    mockGetQqRuntime.mockReturnValue(core);

    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as RuntimeEnv;

    await handleOb11Event({
      event: {
        post_type: "message",
        message_type: "private",
        user_id: 10001,
        message_id: 20002,
        message: [{ type: "image", data: { url: "https://example.com/img.png" } }],
      },
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        connection: {},
        config: {
          dmPolicy: "open",
          groupPolicy: "allowlist",
          allowFrom: [],
          groupAllowFrom: [],
          requireMention: true,
        },
      } as never,
      config: {} as OpenClawConfig,
      runtime,
    });

    const payload = finalizeInboundContext.mock.calls[0]?.[0] as
      | { MediaUrls?: string[]; BodyForAgent?: string }
      | undefined;
    expect(payload?.MediaUrls).toEqual(["https://example.com/img.png"]);
    expect(payload?.BodyForAgent).toContain("Attachment: https://example.com/img.png");
    expect(payload?.BodyForAgent).toContain("[Image: https://example.com/img.png]");
    expect(saveMediaBuffer).not.toHaveBeenCalled();
  });

  it("downloads media when inbound message is CQ string format", async () => {
    const finalizeInboundContext = vi.fn((ctx) => ({
      ...ctx,
      SessionKey: ctx.SessionKey ?? "qq:test",
    }));
    const fetchRemoteMedia = vi.fn(async () => ({
      buffer: Buffer.from("img"),
      contentType: "image/png",
      fileName: "img.png",
    }));
    const saveMediaBuffer = vi.fn(async () => ({
      path: "/tmp/openclaw-media/inbound/img---uuid.png",
      contentType: "image/png",
      id: "img---uuid.png",
      size: 3,
    }));
    const core = {
      channel: {
        commands: {
          shouldHandleTextCommands: () => false,
        },
        text: {
          hasControlCommand: () => false,
        },
        routing: {
          resolveAgentRoute: () => ({
            agentId: "default",
            accountId: "default",
            sessionKey: "qq:test",
          }),
        },
        session: {
          resolveStorePath: () => "/tmp/qq-session",
          readSessionUpdatedAt: () => Date.now() - 1_000,
          recordInboundSession: async () => undefined,
        },
        media: {
          fetchRemoteMedia,
          saveMediaBuffer,
        },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          finalizeInboundContext,
          dispatchReplyWithBufferedBlockDispatcher: async () => undefined,
        },
      },
    } as never;
    mockGetQqRuntime.mockReturnValue(core);

    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as RuntimeEnv;

    await handleOb11Event({
      event: {
        post_type: "message",
        message_type: "private",
        user_id: 10001,
        message_id: 20003,
        message: "[CQ:image,file=https://example.com/img.png]",
      },
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        connection: { messageFormat: "string" },
        config: {
          dmPolicy: "open",
          groupPolicy: "allowlist",
          allowFrom: [],
          groupAllowFrom: [],
          requireMention: true,
        },
      } as never,
      config: {} as OpenClawConfig,
      runtime,
    });

    const payload = finalizeInboundContext.mock.calls[0]?.[0] as
      | { MediaUrls?: string[]; BodyForAgent?: string }
      | undefined;
    expect(payload?.MediaUrls).toEqual(["/tmp/openclaw-media/inbound/img---uuid.png"]);
    expect(payload?.BodyForAgent).toContain("Attachment: /tmp/openclaw-media/inbound/img---uuid.png");
    expect(payload?.BodyForAgent).toContain("[Image: /tmp/openclaw-media/inbound/img---uuid.png]");
    expect(fetchRemoteMedia).toHaveBeenCalledTimes(1);
  });

  it("prefers OneBot get_image local file when multimedia URL fetch is blocked", async () => {
    const finalizeInboundContext = vi.fn((ctx) => ({
      ...ctx,
      SessionKey: ctx.SessionKey ?? "qq:test",
    }));
    const fetchRemoteMedia = vi.fn(async () => {
      throw new Error("should not fetch multimedia url directly");
    });
    const saveMediaBuffer = vi.fn(async () => ({
      path: "/tmp/openclaw-media/inbound/image-from-onebot.png",
      contentType: "image/png",
      id: "image-from-onebot.png",
      size: 3,
    }));
    const core = {
      channel: {
        commands: {
          shouldHandleTextCommands: () => false,
        },
        text: {
          hasControlCommand: () => false,
        },
        routing: {
          resolveAgentRoute: () => ({
            agentId: "default",
            accountId: "default",
            sessionKey: "qq:test",
          }),
        },
        session: {
          resolveStorePath: () => "/tmp/qq-session",
          readSessionUpdatedAt: () => Date.now() - 1_000,
          recordInboundSession: async () => undefined,
        },
        media: {
          fetchRemoteMedia,
          saveMediaBuffer,
        },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          finalizeInboundContext,
          dispatchReplyWithBufferedBlockDispatcher: async () => undefined,
        },
      },
    } as never;
    mockGetQqRuntime.mockReturnValue(core);

    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as RuntimeEnv;
    const localImagePath = `/tmp/qq-onebot-image-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
    await fs.writeFile(localImagePath, Buffer.from("img"));
    try {
      const sendAction = vi.fn(async () => ({
        status: "ok",
        retcode: 0,
        data: { file: localImagePath },
      }));
      mockGetActiveQqClient.mockReturnValue({
        sendAction,
      } as never);

      const multimediaUrl = "https://multimedia.nt.qq.com.cn/download?appid=1407&spec=0";
      await handleOb11Event({
        event: {
          post_type: "message",
          message_type: "private",
          user_id: 10001,
          message_id: 20004,
          message: [{ type: "image", data: { file: "image-token", url: multimediaUrl } }],
        },
        account: {
          accountId: "default",
          enabled: true,
          configured: true,
          connection: {},
          config: {
            dmPolicy: "open",
            groupPolicy: "allowlist",
            allowFrom: [],
            groupAllowFrom: [],
            requireMention: true,
          },
        } as never,
        config: {} as OpenClawConfig,
        runtime,
      });

      const payload = finalizeInboundContext.mock.calls[0]?.[0] as
        | { MediaUrls?: string[]; BodyForAgent?: string }
        | undefined;
      expect(sendAction).toHaveBeenCalledWith("get_image", { file: "image-token" });
      expect(fetchRemoteMedia).not.toHaveBeenCalled();
      expect(payload?.MediaUrls).toEqual(["/tmp/openclaw-media/inbound/image-from-onebot.png"]);
      expect(payload?.BodyForAgent).toContain("/tmp/openclaw-media/inbound/image-from-onebot.png");
      expect(payload?.BodyForAgent).not.toContain("multimedia.nt.qq.com.cn");
    } finally {
      await fs.unlink(localImagePath).catch(() => undefined);
    }
  });
});
