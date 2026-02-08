import type {
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  ChannelOutboundTargetMode,
  OutboundDeliveryResult,
} from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";

import { getActiveQqClient } from "./adapter.js";
import { resolveQqAccount } from "./config.js";
import { getQqRuntime } from "./runtime.js";
import { sendOb11Message } from "./send.js";
import { extractMessageIdFromResponse, rememberSelfSentResponse } from "./self-sent.js";
import { formatQqTarget, normalizeAllowEntry, parseQqTarget, type QQTarget } from "./targets.js";
import type { OB11ActionResponse } from "./types.js";
function resolveMessageId(response: OB11ActionResponse): string {
  return extractMessageIdFromResponse(response) ?? String(Date.now());
}

function normalizeAllowList(allowFrom: Array<string | number> | undefined): {
  list: string[];
  hasWildcard: boolean;
} {
  const raw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  const hasWildcard = raw.includes("*");
  const list = raw.filter((entry) => entry !== "*").map(normalizeAllowEntry).filter(Boolean);
  return { list, hasWildcard };
}

function resolveOutboundTarget(params: {
  to?: string;
  allowFrom?: Array<string | number>;
  mode?: ChannelOutboundTargetMode;
}): { ok: true; target: QQTarget } | { ok: false; error: Error } {
  const trimmed = params.to?.trim() ?? "";
  const { list, hasWildcard } = normalizeAllowList(params.allowFrom);

  if (trimmed) {
    const parsed = parseQqTarget(trimmed);
    if (!parsed) {
      return { ok: false, error: new Error("Invalid QQ target") };
    }
    if ((params.mode === "implicit" || params.mode === "heartbeat") && list.length > 0 && !hasWildcard) {
      const formatted = formatQqTarget(parsed);
      if (!list.includes(formatted)) {
        const fallback = parseQqTarget(list[0] ?? "");
        if (fallback) {
          return { ok: true, target: fallback };
        }
      }
    }
    return { ok: true, target: parsed };
  }

  if (list.length > 0) {
    const fallback = parseQqTarget(list[0] ?? "");
    if (fallback) {
      return { ok: true, target: fallback };
    }
  }

  return {
    ok: false,
    error: new Error("QQ outbound target is missing; set --to or channels.qq.allowFrom"),
  };
}

async function sendMessage(params: {
  ctx: ChannelOutboundContext;
  mediaUrl?: string;
}): Promise<OutboundDeliveryResult> {
  const { cfg, accountId, to, text, replyToId } = params.ctx;
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const account = resolveQqAccount({ cfg, accountId: resolvedAccountId });

  if (!account.enabled) {
    throw new Error(`QQ account disabled: ${resolvedAccountId}`);
  }

  const allowFrom = [
    ...(account.config.allowFrom ?? []),
    ...(account.config.groupAllowFrom ?? []),
  ];
  const targetResult = resolveOutboundTarget({ to, allowFrom });
  if (!targetResult.ok) {
    throw targetResult.error;
  }

  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }

  const response = await sendOb11Message({
    client,
    target: targetResult.target,
    text,
    replyToId: replyToId ?? undefined,
    mediaUrl: params.mediaUrl,
  });
  rememberSelfSentResponse({
    accountId: resolvedAccountId,
    response,
    target: formatQqTarget(targetResult.target),
    text,
  });

  return {
    channel: "qq",
    messageId: resolveMessageId(response),
    timestamp: Date.now(),
    to: formatQqTarget(targetResult.target),
  };
}

export const qqOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getQqRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 2000,
  resolveTarget: ({ to, allowFrom, mode }) => {
    const result = resolveOutboundTarget({ to, allowFrom, mode });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, to: formatQqTarget(result.target) };
  },
  sendText: async (ctx) => sendMessage({ ctx }),
  sendMedia: async (ctx) => sendMessage({ ctx, mediaUrl: ctx.mediaUrl }),
};
