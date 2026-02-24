import type { ChannelMessageActionAdapter, ChannelMessageActionName } from "openclaw/plugin-sdk";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk";
import { listEnabledQqAccounts } from "./config.js";
import {
  addReaction,
  deleteQqMessage,
  kickUser,
  muteUser,
  removeReaction,
  setGroupName,
  setGroupWholeBan,
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
  return ["send", "react", "delete", "timeout", "kick", "ban", "renameGroup", "permissions"];
}

function readBooleanValue(params: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
      if (normalized === "false" || normalized === "0" || normalized === "no") return false;
    }
  }
  return undefined;
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

    if (action === "renameGroup") {
      const groupId = readStringParam(params, "groupId", { required: true });
      const name =
        readStringParam(params, "name") ??
        readStringParam(params, "groupName", { required: true });
      await setGroupName({
        cfg,
        accountId: accountId ?? undefined,
        groupId,
        name,
      });
      return jsonResult({ ok: true, action, groupId, name });
    }

    if (action === "permissions") {
      const groupId = readStringParam(params, "groupId", { required: true });
      const shouldApply =
        readBooleanValue(params, "apply", "set", "mutate", "write") ?? false;
      const enable = readBooleanValue(params, "enable", "wholeBan", "muteAll");
      if (!shouldApply) {
        return jsonResult({
          ok: true,
          action,
          groupId,
          mode: "inspect",
          writable: true,
          supportedUpdates: ["wholeBan"],
          hint: "Set apply=true and enable=true|false to update QQ whole-group mute.",
        });
      }
      if (enable === undefined) {
        throw new Error("permissions apply requires enable=true|false");
      }
      await setGroupWholeBan({
        cfg,
        accountId: accountId ?? undefined,
        groupId,
        enable,
      });
      return jsonResult({ ok: true, action, groupId, mode: "update", enable });
    }

    throw new Error(`Action ${action} not supported for qq.`);
  },
};
