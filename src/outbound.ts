import type {
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  ChannelOutboundTargetMode,
  OutboundDeliveryResult,
} from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { OB11ActionResponse } from "./types.js";
import { getActiveQqClient } from "./adapter.js";
import { resolveDefaultQqAccountId, resolveQqAccount } from "./config.js";
import { getQqRuntime } from "./runtime.js";
import { extractMessageIdFromResponse, rememberSelfSentResponse } from "./self-sent.js";
import { sendOb11Message } from "./send.js";
import { formatQqTarget, normalizeAllowEntry, parseQqTarget, type QQTarget } from "./targets.js";
function resolveMessageId(response: OB11ActionResponse): string {
  return extractMessageIdFromResponse(response) ?? String(Date.now());
}

function normalizeAllowList(allowFrom: Array<string | number> | undefined): {
  list: string[];
  hasWildcard: boolean;
} {
  const raw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  const hasWildcard = raw.includes("*");
  const list = raw
    .filter((entry) => entry !== "*")
    .map(normalizeAllowEntry)
    .filter(Boolean);
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
    if (
      (params.mode === "implicit" || params.mode === "heartbeat") &&
      list.length > 0 &&
      !hasWildcard
    ) {
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
    throw new Error(`QQ account disabled: ${account.accountId}`);
  }

  const allowFrom = [...(account.config.allowFrom ?? []), ...(account.config.groupAllowFrom ?? [])];
  const targetResult = resolveOutboundTarget({ to, allowFrom });
  if (!targetResult.ok) {
    throw targetResult.error;
  }

  const client = getActiveQqClient(account.accountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${account.accountId}`);
  }

  const response = await sendOb11Message({
    client,
    target: targetResult.target,
    text,
    replyToId: replyToId ?? undefined,
    mediaUrl: params.mediaUrl,
  });
  rememberSelfSentResponse({
    accountId: account.accountId,
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
  deliveryMode: "gateway",
  chunker: (text, limit) => {
    return getQqRuntime().channel.text.chunkMarkdownText(text, limit);
  },
  chunkerMode: "markdown",
  textChunkLimit: 2000,
  resolveTarget: ({ to, allowFrom, mode }) => {
    const result = resolveOutboundTarget({ to, allowFrom, mode });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, to: formatQqTarget(result.target) };
  },
  sendText: async (ctx) => sendMessage({ ctx }),
  sendMedia: async (ctx) => sendMessage({ ctx, mediaUrl: ctx.mediaUrl }),
  deleteMessage: async (ctx) => {
    await deleteQqMessage({
      cfg: ctx.cfg,
      accountId: ctx.accountId ?? undefined,
      messageId: ctx.messageId,
    });
    return { success: true };
  },
};

export async function deleteQqMessage(params: {
  cfg: { channels?: { qq?: unknown } };
  accountId?: string;
  messageId: string | number;
}): Promise<void> {
  const resolvedAccountId =
    params.accountId ?? resolveDefaultQqAccountId(params.cfg as Parameters<typeof resolveDefaultQqAccountId>[0]);
  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }
  const response = await client.sendAction("delete_msg", { message_id: params.messageId });
  if (response.status !== "ok" && response.retcode !== 0) {
    throw new Error(response.msg ?? `Failed to delete message: retcode=${response.retcode}`);
  }
}

// Group management functions

export async function muteUser(params: {
  cfg: { channels?: { qq?: unknown } };
  accountId?: string;
  groupId: string;
  userId: string;
  duration: number; // seconds, 0 = unmute
}): Promise<void> {
  const resolvedAccountId = params.accountId ?? resolveDefaultQqAccountId(params.cfg as Parameters<typeof resolveDefaultQqAccountId>[0]);
  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }
  const response = await client.sendAction("set_group_ban", {
    group_id: Number(params.groupId),
    user_id: Number(params.userId),
    duration: params.duration,
  });
  if (response.status !== "ok" && response.retcode !== 0) {
    throw new Error(response.msg ?? `Failed to mute user: retcode=${response.retcode}`);
  }
}

export async function kickUser(params: {
  cfg: { channels?: { qq?: unknown } };
  accountId?: string;
  groupId: string;
  userId: string;
  rejectAdd?: boolean;
}): Promise<void> {
  const resolvedAccountId = params.accountId ?? resolveDefaultQqAccountId(params.cfg as Parameters<typeof resolveDefaultQqAccountId>[0]);
  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }
  const response = await client.sendAction("set_group_kick", {
    group_id: Number(params.groupId),
    user_id: Number(params.userId),
    reject_add_request: params.rejectAdd ?? false,
  });
  if (response.status !== "ok" && response.retcode !== 0) {
    throw new Error(response.msg ?? `Failed to kick user: retcode=${response.retcode}`);
  }
}

export async function setGroupCard(params: {
  cfg: { channels?: { qq?: unknown } };
  accountId?: string;
  groupId: string;
  userId: string;
  card: string;
}): Promise<void> {
  const resolvedAccountId = params.accountId ?? resolveDefaultQqAccountId(params.cfg as Parameters<typeof resolveDefaultQqAccountId>[0]);
  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }
  const response = await client.sendAction("set_group_card", {
    group_id: Number(params.groupId),
    user_id: Number(params.userId),
    card: params.card,
  });
  if (response.status !== "ok" && response.retcode !== 0) {
    throw new Error(response.msg ?? `Failed to set group card: retcode=${response.retcode}`);
  }
}

export async function setGroupWholeBan(params: {
  cfg: { channels?: { qq?: unknown } };
  accountId?: string;
  groupId: string;
  enable: boolean;
}): Promise<void> {
  const resolvedAccountId = params.accountId ?? resolveDefaultQqAccountId(params.cfg as Parameters<typeof resolveDefaultQqAccountId>[0]);
  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }
  const response = await client.sendAction("set_group_whole_ban", {
    group_id: Number(params.groupId),
    enable: params.enable,
  });
  if (response.status !== "ok" && response.retcode !== 0) {
    throw new Error(response.msg ?? `Failed to set whole group ban: retcode=${response.retcode}`);
  }
}

// Reactions support (requires napcat/LLOneBot extended API)

export async function addReaction(params: {
  cfg: { channels?: { qq?: unknown } };
  accountId?: string;
  messageId: string;
  emojiId: string;
}): Promise<void> {
  const resolvedAccountId = params.accountId ?? resolveDefaultQqAccountId(params.cfg as Parameters<typeof resolveDefaultQqAccountId>[0]);
  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }
  const response = await client.sendAction("set_msg_emoji_like", {
    message_id: Number(params.messageId),
    emoji_id: params.emojiId,
  });
  if (response.status !== "ok" && response.retcode !== 0) {
    throw new Error(response.msg ?? `Failed to add reaction: retcode=${response.retcode}`);
  }
}

export async function removeReaction(params: {
  cfg: { channels?: { qq?: unknown } };
  accountId?: string;
  messageId: string;
  emojiId: string;
}): Promise<void> {
  const resolvedAccountId = params.accountId ?? resolveDefaultQqAccountId(params.cfg as Parameters<typeof resolveDefaultQqAccountId>[0]);
  const client = getActiveQqClient(resolvedAccountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${resolvedAccountId}`);
  }
  const response = await client.sendAction("set_msg_emoji_like", {
    message_id: Number(params.messageId),
    emoji_id: params.emojiId,
    set: false,
  });
  if (response.status !== "ok" && response.retcode !== 0) {
    throw new Error(response.msg ?? `Failed to remove reaction: retcode=${response.retcode}`);
  }
}
