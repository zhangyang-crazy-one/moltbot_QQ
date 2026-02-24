import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { handleOb11Event } from "./inbound.js";
import { getQqRuntime } from "./runtime.js";

vi.mock("./runtime.js", () => ({
  getQqRuntime: vi.fn(),
}));

const mockGetQqRuntime = vi.mocked(getQqRuntime);

function buildCore() {
  const finalizeInboundContext = vi.fn((ctx: Record<string, unknown>) => ({
    ...ctx,
    SessionKey: ctx.SessionKey ?? "qq:test",
  }));
  const resolveStorePath = vi.fn(() => "/tmp/qq-session");
  return {
    core: {
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
          resolveStorePath,
          readSessionUpdatedAt: () => Date.now() - 1_000,
          recordInboundSession: async () => undefined,
        },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          finalizeInboundContext,
          dispatchReplyWithBufferedBlockDispatcher: async () => undefined,
        },
      },
    } as never,
    finalizeInboundContext,
    resolveStorePath,
  };
}

const runtime = {
  log: vi.fn(),
  error: vi.fn(),
} as unknown as RuntimeEnv;

describe("handleOb11Event group overrides and offline gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops group message when group-specific config disables group", async () => {
    const { core, finalizeInboundContext } = buildCore();
    mockGetQqRuntime.mockReturnValue(core);

    await handleOb11Event({
      event: {
        post_type: "message",
        message_type: "group",
        user_id: 10001,
        group_id: 12345,
        message_id: 20001,
        message: "hello group",
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
          groupAllowFrom: ["group:12345"],
          requireMention: false,
          groups: {
            "12345": { enabled: false },
          },
        },
      } as never,
      config: {} as OpenClawConfig,
      runtime,
    });

    expect(finalizeInboundContext).not.toHaveBeenCalled();
  });

  it("uses group agent override when resolving session store path", async () => {
    const { core, resolveStorePath } = buildCore();
    mockGetQqRuntime.mockReturnValue(core);

    await handleOb11Event({
      event: {
        post_type: "message",
        message_type: "group",
        user_id: 10001,
        group_id: 12346,
        message_id: 20002,
        message: "hello group",
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
          groupAllowFrom: ["group:12346"],
          requireMention: true,
          groups: {
            "12346": { requireMention: false, agentId: "agent-qq-group" },
          },
        },
      } as never,
      config: {} as OpenClawConfig,
      runtime,
    });

    expect(resolveStorePath).toHaveBeenCalledWith(undefined, {
      agentId: "agent-qq-group",
    });
  });

  it("drops offline private message when reportOfflineMessage is disabled", async () => {
    const { core, finalizeInboundContext } = buildCore();
    mockGetQqRuntime.mockReturnValue(core);

    await handleOb11Event({
      event: {
        post_type: "message",
        sub_type: "offline",
        message_type: "private",
        user_id: 10002,
        message_id: 20003,
        message: "offline message",
      },
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        connection: { reportOfflineMessage: false },
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

    expect(finalizeInboundContext).not.toHaveBeenCalled();
  });
});
