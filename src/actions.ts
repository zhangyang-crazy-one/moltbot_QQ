import type { ChannelMessageActionAdapter, ChannelMessageActionName } from "openclaw/plugin-sdk";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk";
import { listEnabledQqAccounts } from "./config.js";
import {
  addReaction,
  deleteQqMessage,
  kickUser,
  muteUser,
  removeReaction,
} from "./outbound.js";

function resolveDurationSeconds(params: Record<string, unknown>): number {
  const direct = readNumberParam(params, "durationSeconds", { integer: true });
  if (direct !== undefined) {
    return Math.max(0, direct);
  }
  const fallback = readNumberParam(params, "duration", { integer: true });
  if (fallback !== undefined) {
    return Math.max(0, fallback);
  }
  const minutes = readNumberParam(params, "durationMinutes", { integer: true });
  if (minutes !== undefined) {
    return Math.max(0, minutes) * 60;
  }
  throw new Error("durationSeconds (or duration/durationMinutes) required");
}

function listSupportedActions(): ChannelMessageActionName[] {
  return ["send", "react", "delete", "timeout", "kick", "ban"];
}

export const qqMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    const hasConfiguredAccount = listEnabledQqAccounts(cfg).some((account) => account.configured);
    if (!hasConfiguredAccount) {
      return [];
    }
    return listSupportedActions();
  },
  supportsAction: ({ action }) => action !== "send",
  handleAction: async ({ action, params, cfg, accountId }) => {
    if (action === "send") {
      throw new Error("Send should be handled by outbound, not actions handler.");
    }

    if (action === "react") {
      const messageId = readStringParam(params, "messageId", { required: true });
      const emojiId =
        readStringParam(params, "emoji") ??
        readStringParam(params, "emojiId", { required: true });
      const remove = params.remove === true;
      if (remove) {
        await removeReaction({ cfg, accountId: accountId ?? undefined, messageId, emojiId });
        return jsonResult({ ok: true, removed: emojiId });
      }
      await addReaction({ cfg, accountId: accountId ?? undefined, messageId, emojiId });
      return jsonResult({ ok: true, added: emojiId });
    }

    if (action === "delete") {
      const messageId = readStringParam(params, "messageId", { required: true });
      await deleteQqMessage({ cfg, accountId: accountId ?? undefined, messageId });
      return jsonResult({ ok: true, action: "delete", messageId });
    }

    if (action === "timeout") {
      const groupId = readStringParam(params, "groupId", { required: true });
      const userId = readStringParam(params, "userId", { required: true });
      const duration = resolveDurationSeconds(params);
      await muteUser({
        cfg,
        accountId: accountId ?? undefined,
        groupId,
        userId,
        duration,
      });
      return jsonResult({ ok: true, action: "timeout", duration });
    }

    if (action === "kick" || action === "ban") {
      const groupId = readStringParam(params, "groupId", { required: true });
      const userId = readStringParam(params, "userId", { required: true });
      const rejectAdd = action === "ban" ? true : params.rejectAdd === true;
      await kickUser({
        cfg,
        accountId: accountId ?? undefined,
        groupId,
        userId,
        rejectAdd,
      });
      return jsonResult({ ok: true, action, rejectAdd });
    }

    throw new Error(`Action ${action} not supported for qq.`);
  },
};
