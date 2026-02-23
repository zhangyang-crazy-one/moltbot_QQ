import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { handleOb11Event } from "./inbound.js";
import { getQqRuntime } from "./runtime.js";

vi.mock("./runtime.js", () => ({
  getQqRuntime: vi.fn(),
}));

const mockGetQqRuntime = vi.mocked(getQqRuntime);

describe("handleOb11Event envelope body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses formatted envelope body for inbound context Body", async () => {
    const finalizeInboundContext = vi.fn((ctx) => ({
      ...ctx,
      SessionKey: ctx.SessionKey ?? "qq:test",
    }));
    const dispatchReplyWithBufferedBlockDispatcher = vi.fn(async () => undefined);
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
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatAgentEnvelope: ({ body }: { body: string }) => `wrapped:${body}`,
          finalizeInboundContext,
          dispatchReplyWithBufferedBlockDispatcher,
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
        message: "hello qq",
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

    expect(finalizeInboundContext).toHaveBeenCalled();
    const call = finalizeInboundContext.mock.calls[0]?.[0] as { Body?: string } | undefined;
    expect(call?.Body).toBe("wrapped:hello qq");
  });
});
