import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { qqOutbound } from "./outbound.js";
import { getActiveQqClient } from "./adapter.js";
import { resolveQqAccount } from "./config.js";
import { sendOb11Message } from "./send.js";
import { rememberSelfSentResponse } from "./self-sent.js";

vi.mock("./adapter.js", () => ({
  getActiveQqClient: vi.fn(),
}));

vi.mock("./config.js", () => ({
  resolveDefaultQqAccountId: vi.fn(() => "default"),
  resolveQqAccount: vi.fn(),
}));

vi.mock("./send.js", () => ({
  sendOb11Message: vi.fn(),
}));

vi.mock("./self-sent.js", () => ({
  extractMessageIdFromResponse: vi.fn(),
  rememberSelfSentResponse: vi.fn(),
}));

const mockGetActiveQqClient = vi.mocked(getActiveQqClient);
const mockResolveQqAccount = vi.mocked(resolveQqAccount);
const mockSendOb11Message = vi.mocked(sendOb11Message);
const mockRememberSelfSentResponse = vi.mocked(rememberSelfSentResponse);

describe("qqOutbound self-sent cache account id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores self-sent cache under resolved account id", async () => {
    mockResolveQqAccount.mockReturnValue({
      accountId: "qq-main",
      enabled: true,
      configured: true,
      config: { allowFrom: [], groupAllowFrom: [] },
    } as never);
    mockGetActiveQqClient.mockReturnValue({ messageFormat: "array" } as never);
    mockSendOb11Message.mockResolvedValue({
      status: "ok",
      retcode: 0,
      data: { message_id: 1234 },
    });

    await qqOutbound.sendText?.({
      cfg: {} as OpenClawConfig,
      to: "10001",
      text: "hello",
      accountId: "default",
    });

    expect(mockRememberSelfSentResponse).toHaveBeenCalledWith({
      accountId: "qq-main",
      response: { status: "ok", retcode: 0, data: { message_id: 1234 } },
      target: "10001",
      text: "hello",
    });
  });
});
