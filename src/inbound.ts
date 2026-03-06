import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  logInboundDrop,
  mergeAllowlist,
  resolveControlCommandGate,
  resolveMentionGatingWithBypass,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import type {
  OB11ActionResponse,
  OB11Event,
  OB11MessageSegment,
  ResolvedQQAccount,
} from "./types.js";
import { getActiveQqClient } from "./adapter.js";
import { resolveGroupConfig } from "./config.js";
import { parseCqSegments } from "./cqcode.js";
import { parseOb11Message, hasSelfMention } from "./message-utils.js";
import { getQqRuntime } from "./runtime.js";
import { rememberSelfSentResponse, wasSelfSentMessage } from "./self-sent.js";
import { sendOb11Message } from "./send.js";
import { formatQqTarget, normalizeAllowEntry, type QQTarget } from "./targets.js";

const CHANNEL_ID = "qq" as const;
const QQ_INBOUND_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

type StatusSink = (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;

type Allowlist = {
  list: string[];
  hasWildcard: boolean;
  configured: boolean;
};

function normalizeAllowList(entries?: Array<string | number>): Allowlist {
  const raw = (entries ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  const hasWildcard = raw.includes("*");
  const list = raw
    .filter((entry) => entry !== "*")
    .map(normalizeAllowEntry)
    .filter(Boolean);
  return { list, hasWildcard, configured: list.length > 0 || hasWildcard };
}

function isAllowed(allowlist: Allowlist, id: string): boolean {
  if (allowlist.hasWildcard) return true;
  return allowlist.list.includes(id);
}

function buildTarget(params: {
  isGroup: boolean;
  senderId: string;
  groupId?: string;
}): QQTarget | null {
  if (params.isGroup) {
    if (!params.groupId) return null;
    return { kind: "group", id: params.groupId };
  }
  return { kind: "private", id: params.senderId };
}

function toSegmentString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveLocalMediaPath(value: string): string | null {
  if (!value) return null;
  if (value.startsWith("file://")) {
    try {
      return fileURLToPath(value);
    } catch {
      return null;
    }
  }
  return path.isAbsolute(value) ? value : null;
}

function isOb11ActionSuccess(response: OB11ActionResponse | undefined): boolean {
  if (!response) return false;
  if (typeof response.status === "string" && response.status.toLowerCase() !== "ok") {
    return false;
  }
  if (typeof response.retcode === "number" && response.retcode !== 0) {
    return false;
  }
  return true;
}

function extractMediaSourceFromActionData(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") {
    const candidate = value.trim();
    if (!candidate) return null;
    if (isHttpUrl(candidate)) return candidate;
    if (resolveLocalMediaPath(candidate)) return candidate;
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const matched = extractMediaSourceFromActionData(entry, depth + 1);
      if (matched) return matched;
    }
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["file", "path", "url", "src", "download", "download_url"]) {
    const matched = extractMediaSourceFromActionData(record[key], depth + 1);
    if (matched) return matched;
  }
  for (const nested of Object.values(record)) {
    const matched = extractMediaSourceFromActionData(nested, depth + 1);
    if (matched) return matched;
  }
  return null;
}

function buildInboundMediaResolutionActions(params: {
  segmentType: string;
  fileToken: string;
}): Array<{ action: string; payload: Record<string, unknown> }> {
  const fileToken = params.fileToken.trim();
  if (!fileToken || isHttpUrl(fileToken) || resolveLocalMediaPath(fileToken)) {
    return [];
  }

  if (params.segmentType === "image") {
    return [{ action: "get_image", payload: { file: fileToken } }];
  }
  if (params.segmentType === "record") {
    return [
      { action: "get_record", payload: { file: fileToken } },
      { action: "get_record", payload: { file: fileToken, out_format: "mp3" } },
    ];
  }
  if (params.segmentType === "video") {
    return [{ action: "get_video", payload: { file: fileToken } }];
  }
  return [];
}

async function resolveInboundMediaSourceViaOneBot(params: {
  accountId: string;
  segmentType: string;
  fileToken: string;
  runtime: RuntimeEnv;
}): Promise<string | null> {
  const client = getActiveQqClient(params.accountId);
  if (!client) return null;

  const attempts = buildInboundMediaResolutionActions({
    segmentType: params.segmentType,
    fileToken: params.fileToken,
  });
  for (const attempt of attempts) {
    try {
      const response = await client.sendAction(attempt.action, attempt.payload);
      if (!isOb11ActionSuccess(response)) {
        continue;
      }
      const source = extractMediaSourceFromActionData(response.data);
      if (source) return source;
    } catch (err) {
      params.runtime.log?.(
        `qq: media action ${attempt.action} failed for ${params.segmentType}: ${String(err)}`,
      );
    }
  }
  return null;
}

async function resolveInboundMediaUrl(params: {
  source: string;
  fileNameHint?: string;
  runtime: RuntimeEnv;
}): Promise<string> {
  const source = params.source.trim();
  if (!source) return source;

  const core = getQqRuntime();
  const media = core.channel?.media;
  if (!media) return source;

  try {
    if (isHttpUrl(source)) {
      const fetched = await media.fetchRemoteMedia({
        url: source,
        filePathHint: params.fileNameHint || source,
        maxBytes: QQ_INBOUND_MEDIA_MAX_BYTES,
      });
      const saved = await media.saveMediaBuffer(
        fetched.buffer,
        fetched.contentType,
        "inbound",
        QQ_INBOUND_MEDIA_MAX_BYTES,
        fetched.fileName ?? params.fileNameHint,
      );
      return saved.path;
    }

    const localPath = resolveLocalMediaPath(source);
    if (!localPath) {
      return source;
    }
    const buffer = await fs.readFile(localPath);
    const saved = await media.saveMediaBuffer(
      buffer,
      undefined,
      "inbound",
      QQ_INBOUND_MEDIA_MAX_BYTES,
      params.fileNameHint ?? path.basename(localPath),
    );
    return saved.path;
  } catch (err) {
    params.runtime.log?.(`qq: failed to localize inbound media ${source}: ${String(err)}`);
    return source;
  }
}

function replaceMediaReferences(raw: string, replacements: Map<string, string>): string {
  if (!raw || replacements.size === 0) {
    return raw;
  }
  let next = raw;
  for (const [from, to] of replacements) {
    if (!from || !to || from === to) continue;
    next = next.split(from).join(to);
  }
  return next;
}

async function collectInboundMedia(params: {
  accountId: string;
  segments: OB11MessageSegment[] | undefined;
  runtime: RuntimeEnv;
}): Promise<{ mediaInfo: string; mediaUrls: string[]; replacements: Map<string, string> }> {
  const mediaInfoLines: string[] = [];
  const mediaUrls: string[] = [];
  const replacements = new Map<string, string>();
  const segments = params.segments ?? [];

  for (const seg of segments) {
    if (seg.type !== "image" && seg.type !== "video" && seg.type !== "record" && seg.type !== "file") {
      continue;
    }

    const fileCandidate = toSegmentString(seg.data?.file);
    const urlCandidate = toSegmentString(seg.data?.url);
    const oneBotSource = await resolveInboundMediaSourceViaOneBot({
      accountId: params.accountId,
      segmentType: seg.type,
      fileToken: fileCandidate,
      runtime: params.runtime,
    });
    // Prefer local file paths from OneBot payloads when available.
    const source = oneBotSource || (resolveLocalMediaPath(fileCandidate)
      ? fileCandidate
      : (urlCandidate || fileCandidate));
    if (!source) {
      continue;
    }

    const fileNameHint =
      toSegmentString(seg.data?.name) ||
      (seg.type === "file" ? path.basename(source) : "") ||
      undefined;
    const resolved = await resolveInboundMediaUrl({
      source,
      fileNameHint,
      runtime: params.runtime,
    });

    mediaUrls.push(resolved);
    if (resolved !== source) {
      replacements.set(source, resolved);
    }
    if (urlCandidate && resolved !== urlCandidate) {
      replacements.set(urlCandidate, resolved);
    }
    if (fileCandidate && resolved !== fileCandidate) {
      replacements.set(fileCandidate, resolved);
    }

    if (seg.type === "image") {
      mediaInfoLines.push(`[Image: ${resolved}]`);
      continue;
    }
    if (seg.type === "video") {
      mediaInfoLines.push(`[Video: ${resolved}]`);
      continue;
    }
    if (seg.type === "record") {
      mediaInfoLines.push(`[Voice: ${resolved}]`);
      continue;
    }
    const displayName = fileNameHint || "file";
    mediaInfoLines.push(`[File: ${displayName}]`);
  }

  return {
    mediaInfo: mediaInfoLines.join("\n"),
    mediaUrls,
    replacements,
  };
}

function resolveInboundSegments(
  message?: string | OB11MessageSegment[],
): OB11MessageSegment[] | undefined {
  if (Array.isArray(message)) {
    return message;
  }
  if (typeof message !== "string" || !message.trim()) {
    return undefined;
  }
  return parseCqSegments(message).map((segment) => ({
    type: segment.type,
    data: segment.data,
  }));
}

export async function handleOb11Event(params: {
  event: OB11Event;
  account: ResolvedQQAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  statusSink?: StatusSink;
}): Promise<void> {
  const { event, account, config, runtime, statusSink } = params;

  try {
    const postType = String(event.post_type ?? "").toLowerCase();
    if (postType !== "message" && postType !== "message_sent") {
      return;
    }
    const subType = String(event.sub_type ?? "").toLowerCase();
    if (
      postType === "message" &&
      subType === "offline" &&
      !account.connection?.reportOfflineMessage
    ) {
      return;
    }

    const messageType = String(event.message_type ?? "").toLowerCase();
    const isGroup = messageType === "group";
    const senderId = event.user_id != null ? String(event.user_id) : "";
    if (!senderId) {
      return;
    }

    const groupId = event.group_id != null ? String(event.group_id) : undefined;
    const target = buildTarget({ isGroup, senderId, groupId });
    if (!target) {
      return;
    }
    const groupConfig = isGroup ? resolveGroupConfig(account.config, groupId ?? "") : null;

    if (postType === "message_sent" && !account.connection?.reportSelfMessage) {
      return;
    }
    const parsed = parseOb11Message(event.message ?? event.raw_message);
    const rawBody = parsed.text.trim();
    const inboundSegments = resolveInboundSegments(event.message ?? event.raw_message);

    // Check if message has any content (text or attachments)
    const hasTextContent = rawBody.length > 0;
    const hasMediaContent = Boolean(
      inboundSegments?.some(
        (seg) =>
          seg.type === "image" ||
          seg.type === "video" ||
          seg.type === "record" ||
          seg.type === "file",
      ),
    );

    if (!hasTextContent && !hasMediaContent) {
      return;
    }

    if (postType === "message_sent") {
      const messageId = event.message_id != null ? String(event.message_id) : undefined;
      if (
        wasSelfSentMessage({
          accountId: account.accountId,
          messageId,
          target: formatQqTarget(target),
          text: rawBody,
        })
      ) {
        return;
      }
    }

    const core = getQqRuntime();

    const selfId = event.self_id != null ? String(event.self_id) : undefined;
    const wasMentioned = isGroup ? hasSelfMention(parsed.mentions, selfId) : false;
    const timestamp = typeof event.time === "number" ? event.time * 1000 : Date.now();

    statusSink?.({ lastInboundAt: timestamp });

    const dmPolicy = account.config.dmPolicy ?? "pairing";
    const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
    const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

    const configGroupAllowFrom = normalizeAllowList(account.config.groupAllowFrom);
    const storeAllowFrom = (core.channel?.pairing)
      ? await core.channel.pairing.readAllowFromStore(CHANNEL_ID).catch(() => [])
      : [];

    const effectiveAllowFrom = normalizeAllowList(
      mergeAllowlist({ existing: account.config.allowFrom, additions: storeAllowFrom }),
    );

    const allowTextCommands = core.channel?.commands?.shouldHandleTextCommands({
      cfg: config as OpenClawConfig,
      surface: CHANNEL_ID,
    }) ?? false;
    const useAccessGroups = config.commands?.useAccessGroups !== false;
    const senderAllowedForCommands = isAllowed(
      isGroup ? configGroupAllowFrom : effectiveAllowFrom,
      isGroup ? `group:${groupId ?? ""}` : senderId,
    );
    const hasControlCommand = core.channel?.text?.hasControlCommand(rawBody, config as OpenClawConfig) ?? false;
    const commandGate = resolveControlCommandGate({
      useAccessGroups,
      authorizers: [
        {
          configured: (isGroup ? configGroupAllowFrom : effectiveAllowFrom).configured,
          allowed: senderAllowedForCommands,
        },
      ],
      allowTextCommands,
      hasControlCommand,
    });
    const commandAuthorized = commandGate.commandAuthorized;

    if (isGroup) {
      if (!groupConfig?.enabled) {
        runtime.log?.(`qq: drop group ${groupId ?? ""} (group disabled in config)`);
        return;
      }
      if (groupPolicy === "disabled") {
        runtime.log?.(`qq: drop group ${groupId ?? ""} (groupPolicy=disabled)`);
        return;
      }
      if (groupPolicy === "allowlist") {
        const groupKey = `group:${groupId ?? ""}`;
        if (!isAllowed(configGroupAllowFrom, groupKey)) {
          runtime.log?.(`qq: drop group ${groupId ?? ""} (not allowlisted)`);
          return;
        }
      }

      if (commandGate.shouldBlock) {
        logInboundDrop({
          log: (message) => runtime.log?.(message),
          channel: CHANNEL_ID,
          reason: "control command (unauthorized)",
          target: senderId,
        });
        return;
      }

      const requireMention = groupConfig?.requireMention ?? true;
      const mentionGate = resolveMentionGatingWithBypass({
        isGroup,
        requireMention,
        wasMentioned,
        allowTextCommands,
        hasControlCommand,
        commandAuthorized,
      });
      if (mentionGate.shouldSkip) {
        runtime.log?.(`qq: drop group ${groupId ?? ""} (no mention)`);
        return;
      }
    } else {
      if (dmPolicy === "disabled") {
        runtime.log?.(`qq: drop DM sender=${senderId} (dmPolicy=disabled)`);
        return;
      }
      const senderAllowed = isAllowed(effectiveAllowFrom, senderId);
      if (dmPolicy !== "open" && !senderAllowed) {
        if (dmPolicy === "pairing" && core.channel?.pairing) {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: CHANNEL_ID,
            id: senderId,
            meta: { name: event.sender?.nickname ?? undefined },
          });
          if (created) {
            try {
              const client = getActiveQqClient(account.accountId);
              if (client) {
                const pairingText = core.channel?.pairing?.buildPairingReply({
                  channel: CHANNEL_ID,
                  idLine: `Your QQ user id: ${senderId}`,
                  code,
                }) ?? "";
                const response = await sendOb11Message({
                  client,
                  target,
                  text: pairingText,
                });
                rememberSelfSentResponse({
                  accountId: account.accountId,
                  response,
                  target: formatQqTarget(target),
                  text: pairingText,
                });
                statusSink?.({ lastOutboundAt: Date.now() });
              }
            } catch (err) {
              runtime.error?.(`qq: pairing reply failed for ${senderId}: ${String(err)}`);
            }
          }
        }
        runtime.log?.(`qq: drop DM sender=${senderId} (dmPolicy=${dmPolicy})`);
        return;
      }
    }

    const route = core.channel?.routing?.resolveAgentRoute({
      cfg: config as OpenClawConfig,
      channel: CHANNEL_ID,
      accountId: account.accountId,
      peer: {
        kind: isGroup ? "group" : "dm",
        id: isGroup ? (groupId ?? senderId) : senderId,
      },
    }) ?? { agentId: "default", sessionKey: "" };
    const effectiveAgentId = groupConfig?.agentId ?? route.agentId;

    const senderName = event.sender?.card?.trim() || event.sender?.nickname?.trim() || undefined;
    const fromLabel = isGroup ? `group:${groupId ?? ""}` : senderName || `user:${senderId}`;

    const storePath = core.channel?.session?.resolveStorePath(config.session?.store, {
      agentId: effectiveAgentId,
    }) ?? "";
    const envelopeOptions = core.channel?.reply?.resolveEnvelopeFormatOptions(config as OpenClawConfig) ?? {};
    const previousTimestamp = core.channel?.session?.readSessionUpdatedAt({
      storePath,
      sessionKey: route.sessionKey,
    }) ?? Date.now();

    const media = await collectInboundMedia({
      accountId: account.accountId,
      segments: inboundSegments,
      runtime,
    });
    const normalizedRawBody = replaceMediaReferences(rawBody, media.replacements);

    // Combine text body with media info
    const fullBody = normalizedRawBody
      ? (normalizedRawBody + "\n" + media.mediaInfo).trim()
      : media.mediaInfo.trim();

    const body = core.channel?.reply?.formatAgentEnvelope({
      channel: "QQ",
      from: fromLabel,
      timestamp,
      previousTimestamp,
      envelope: envelopeOptions,
      body: normalizedRawBody,
    }) ?? normalizedRawBody;

    const ctxPayload = core.channel?.reply?.finalizeInboundContext({
      Body: body,
      BodyForAgent: fullBody,
      RawBody: fullBody,
      CommandBody: fullBody,
      From: isGroup ? `qq:group:${groupId ?? ""}` : `qq:${senderId}`,
      To: `qq:${formatQqTarget(target)}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: isGroup ? "group" : "direct",
      ConversationLabel: fromLabel,
      SenderName: senderName,
      SenderId: senderId,
      GroupSubject: isGroup ? (groupId ?? undefined) : undefined,
      Provider: CHANNEL_ID,
      Surface: CHANNEL_ID,
      WasMentioned: isGroup ? wasMentioned : undefined,
      MessageSid: event.message_id != null ? String(event.message_id) : undefined,
      Timestamp: timestamp,
      OriginatingChannel: CHANNEL_ID,
      OriginatingTo: `qq:${formatQqTarget(target)}`,
      CommandAuthorized: commandAuthorized,
      MediaUrls: media.mediaUrls.length > 0 ? media.mediaUrls : undefined,
    });

    if (!ctxPayload) {
      return;
    }

    await core.channel?.session?.recordInboundSession({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
      onRecordError: (err) => {
        runtime.error?.(`qq: failed updating session meta: ${String(err)}`);
      },
    });

    await core.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: config as OpenClawConfig,
      dispatcherOptions: {
        deliver: async (payload) => {
          try {
            const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
            const client = getActiveQqClient(account.accountId);
            if (!client) {
              throw new Error(`QQ client not running for account ${account.accountId}`);
            }
            const response = await sendOb11Message({
              client,
              target,
              text: payload.text ?? "",
              replyToId: payload.replyToId,
              mediaUrl,
            });
            rememberSelfSentResponse({
              accountId: account.accountId,
              response,
              target: formatQqTarget(target),
              text: payload.text ?? "",
            });
            statusSink?.({ lastOutboundAt: Date.now() });
          } catch (err) {
            throw err;
          }
        },
        onError: (err, info) => {
          runtime.error?.(`qq ${info.kind} reply failed: ${String(err)}`);
        },
      },
    }).catch((err) => {
      runtime.error?.(`qq dispatch exception: ${String(err)}`);
    });
  } catch (err) {
    runtime.error?.(`qq handleOb11Event error: ${String(err)}`);
  }
}
