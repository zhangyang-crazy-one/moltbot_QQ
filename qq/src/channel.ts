import type {
  ChannelDirectoryEntry,
  ChannelPlugin,
  ChannelSetupInput,
  ClawdbotConfig,
  ChannelLogSink,
  RuntimeEnv,
} from "openclaw/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk";

import type { Ob11Client } from "./adapter.js";
import { clearActiveQqClient, getActiveQqClient, startQqClient } from "./adapter.js";
import { QQConfigSchema } from "./config-schema.js";
import {
  isConnectionConfigured,
  listQqAccountIds,
  resolveConnectionIssue,
  resolveDefaultQqAccountId,
  resolveQqAccount,
} from "./config.js";
import { handleOb11Event } from "./inbound.js";
import { qqOutbound } from "./outbound.js";
import { sendOb11Message } from "./send.js";
import { rememberSelfSentResponse } from "./self-sent.js";
import { formatQqTarget, normalizeAllowEntry, parseQqTarget } from "./targets.js";
import type { OB11ActionResponse, QQConnectionConfig, ResolvedQQAccount } from "./types.js";

const CHANNEL_ID = "qq";

const meta = {
  id: "qq",
  label: "QQ",
  selectionLabel: "QQ (OneBot 11)",
  docsPath: "/channels/qq",
  docsLabel: "qq",
  blurb: "QQ via OneBot 11 backends (LLOneBot/napcat/go-cqhttp).",
  order: 90,
  quickstartAllowFrom: true,
};

function normalizeQqMessagingTarget(raw: string): string | undefined {
  const parsed = parseQqTarget(raw);
  if (!parsed) return undefined;
  return formatQqTarget(parsed);
}

function resolveConnectionBaseUrl(connection?: QQConnectionConfig): string | undefined {
  if (!connection) return undefined;
  if (connection.type === "ws" || connection.type === "http") {
    const host = connection.host?.trim();
    const port = connection.port;
    if (!host || !port) return undefined;
    return `${connection.type}://${host}:${port}`;
  }
  if (connection.type === "http-post" || connection.type === "ws-reverse") {
    return connection.url?.trim() || undefined;
  }
  return undefined;
}

function resolveLogger(runtime: RuntimeEnv, log?: ChannelLogSink): ChannelLogSink {
  if (log) return log;
  return {
    info: (message) => runtime.log(message),
    warn: (message) => runtime.log(message),
    error: (message) => runtime.error(message),
  };
}

function parsePort(value?: string | number): number | null {
  if (value == null) return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseConnectionInput(input: ChannelSetupInput): {
  connection?: QQConnectionConfig;
  error?: string;
} {
  const rawUrl = input.url?.trim() || input.httpUrl?.trim();
  if (rawUrl) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { error: "Connection URL is invalid." };
    }
    const protocol = parsed.protocol.replace(":", "");
    const host = parsed.hostname.trim();
    const port =
      parsePort(parsed.port) ??
      (protocol === "https" || protocol === "wss" ? 443 : protocol ? 80 : null);
    if (!host) return { error: "Connection URL must include a host." };
    if (!port) return { error: "Connection URL must include a port." };
    if (protocol === "http" || protocol === "https") {
      return {
        connection: {
          type: "http",
          host,
          port,
          token: input.token?.trim() || undefined,
        },
      };
    }
    if (protocol === "ws" || protocol === "wss") {
      return {
        connection: {
          type: "ws",
          host,
          port,
          token: input.token?.trim() || undefined,
        },
      };
    }
    return { error: "Connection URL must start with http(s):// or ws(s)://." };
  }

  if (input.httpHost || input.httpPort) {
    const host = input.httpHost?.trim();
    const port = parsePort(input.httpPort);
    if (!host) return { error: "HTTP host is required." };
    if (!port) return { error: "HTTP port must be a number." };
    return {
      connection: {
        type: "http",
        host,
        port,
        token: input.token?.trim() || undefined,
      },
    };
  }

  return {};
}

function applyConnectionConfig(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  connection: QQConnectionConfig;
}): ClawdbotConfig {
  const accountId = normalizeAccountId(params.accountId);
  const channels = params.cfg.channels ?? {};
  const base = (channels.qq ?? {}) as Record<string, unknown>;
  const baseAccounts =
    base.accounts && typeof base.accounts === "object"
      ? (base.accounts as Record<string, Record<string, unknown>>)
      : undefined;
  const useAccounts = accountId !== DEFAULT_ACCOUNT_ID || Boolean(baseAccounts);
  const baseConfig = useAccounts
    ? (({ connection: _ignored, ...rest }) => rest)(base)
    : base;

  if (!useAccounts) {
    return {
      ...params.cfg,
      channels: {
        ...channels,
        qq: {
          ...baseConfig,
          enabled: true,
          connection: params.connection,
        },
      },
    } as ClawdbotConfig;
  }

  const accounts = { ...(baseAccounts ?? {}) };
  const existing = accounts[accountId] ?? {};
  return {
    ...params.cfg,
    channels: {
      ...channels,
      qq: {
        ...baseConfig,
        enabled: true,
        accounts: {
          ...accounts,
          [accountId]: {
            ...existing,
            enabled: true,
            connection: params.connection,
          },
        },
      },
    },
  } as ClawdbotConfig;
}

function resolveOutboundAccountId(
  cfg: ClawdbotConfig,
  accountId?: string | null,
): string {
  if (accountId?.trim()) return accountId.trim();
  return resolveDefaultQqAccountId(cfg);
}

function requireActiveClient(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): { accountId: string; client: Ob11Client } {
  const accountId = resolveOutboundAccountId(params.cfg, params.accountId);
  const client = getActiveQqClient(accountId);
  if (!client) {
    throw new Error(`QQ client not running for account ${accountId}`);
  }
  return { accountId, client };
}

function isActionOk(response: OB11ActionResponse): boolean {
  if (response.status) return response.status === "ok";
  if (typeof response.retcode === "number") return response.retcode === 0;
  return true;
}

function resolveActionError(response: OB11ActionResponse): string {
  if (response.msg) return response.msg;
  if (typeof response.retcode === "number") return `retcode=${response.retcode}`;
  return "action failed";
}

export const qqPlugin: ChannelPlugin<ResolvedQQAccount> = {
  id: "qq",
  meta,
  pairing: {
    idLabel: "qqUserId",
    normalizeAllowEntry,
    notifyApproval: async ({ cfg, id, runtime }) => {
      const accountId = resolveDefaultQqAccountId(cfg);
      const client = getActiveQqClient(accountId);
      if (!client) {
        runtime?.log?.(`qq: unable to notify ${id} (client not running)`);
        return;
      }
      const response = await sendOb11Message({
        client,
        target: { kind: "private", id },
        text: PAIRING_APPROVED_MESSAGE,
      });
      rememberSelfSentResponse({
        accountId,
        response,
        target: formatQqTarget({ kind: "private", id }),
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    polls: false,
    reactions: false,
    threads: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.qq"] },
  configSchema: buildChannelConfigSchema(QQConfigSchema),
  config: {
    listAccountIds: (cfg) => listQqAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveQqAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultQqAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "qq",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "qq",
        accountId,
        clearBaseFields: [
          "name",
          "markdown",
          "connection",
          "allowFrom",
          "groupAllowFrom",
          "dmPolicy",
          "groupPolicy",
          "requireMention",
          "defaultAccount",
        ],
      }),
    isConfigured: (account) => isConnectionConfigured(account.connection),
    unconfiguredReason: (account) => resolveConnectionIssue(account.connection) ?? "not configured",
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      mode: account.connection?.type,
      baseUrl: resolveConnectionBaseUrl(account.connection),
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveQqAccount({ cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map(normalizeAllowEntry),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.qq?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.qq.accounts.${resolvedAccountId}.`
        : "channels.qq.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: `${basePath}allowFrom`,
        approveHint: formatPairingApproveHint(CHANNEL_ID),
        normalizeEntry: normalizeAllowEntry,
      };
    },
    collectWarnings: ({ cfg, account }) => {
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      const groupAllowlist = account.config.groupAllowFrom ?? [];
      if (groupPolicy !== "open") return [];
      if (groupAllowlist.length > 0) {
        return [
          '- QQ groups: groupPolicy="open" allows any group to trigger (mention-gated). Set channels.qq.groupPolicy="allowlist" and channels.qq.groupAllowFrom to restrict groups.',
        ];
      }
      return [
        '- QQ groups: groupPolicy="open" with no group allowlist allows any group to trigger (mention-gated). Set channels.qq.groupPolicy="allowlist" and channels.qq.groupAllowFrom to restrict groups.',
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) =>
      resolveQqAccount({ cfg, accountId }).config.requireMention ?? true,
  },
  messaging: {
    normalizeTarget: normalizeQqMessagingTarget,
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (/^qq:/i.test(trimmed)) return true;
        if (/^(group|g|user):/i.test(trimmed)) return true;
        return /^\d{3,}$/.test(trimmed);
      },
      hint: "<qqId | group:groupId>",
    },
  },
  outbound: qqOutbound,
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: CHANNEL_ID,
            accountId: account.accountId,
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      mode: snapshot.mode ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      mode: account.connection?.type,
      baseUrl: resolveConnectionBaseUrl(account.connection),
      dmPolicy: account.config.dmPolicy ?? "pairing",
      allowFrom: (account.config.allowFrom ?? []).map((entry) =>
        normalizeAllowEntry(String(entry)),
      ),
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  directory: {
    self: async ({ cfg, accountId }) => {
      const { client } = requireActiveClient({ cfg, accountId });
      const response = await client.sendAction("get_login_info");
      if (!isActionOk(response)) return null;
      const data = response.data as Record<string, unknown> | undefined;
      const userId = data?.user_id ?? data?.userId;
      if (userId == null) return null;
      const nickname = typeof data?.nickname === "string" ? data.nickname.trim() : undefined;
      return {
        kind: "user",
        id: String(userId),
        name: nickname,
        raw: data,
      } satisfies ChannelDirectoryEntry;
    },
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const { client } = requireActiveClient({ cfg, accountId });
      const response = await client.sendAction("get_friend_list");
      if (!isActionOk(response)) {
        throw new Error(resolveActionError(response));
      }
      const data = Array.isArray(response.data) ? response.data : [];
      const q = query?.trim().toLowerCase() ?? "";
      const entries = data
        .map((entry) => entry as Record<string, unknown>)
        .map((entry) => ({
          id: entry.user_id ?? entry.userId,
          nickname: entry.remark ?? entry.nickname ?? entry.nick ?? "",
          raw: entry,
        }))
        .filter((entry) => entry.id != null)
        .map((entry) => ({
          kind: "user" as const,
          id: String(entry.id),
          name: entry.nickname ? String(entry.nickname).trim() : undefined,
          raw: entry.raw,
        }))
        .filter((entry) => {
          if (!q) return true;
          return (
            entry.id.toLowerCase().includes(q) ||
            (entry.name?.toLowerCase().includes(q) ?? false)
          );
        });
      if (limit && limit > 0) return entries.slice(0, limit);
      return entries;
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const { client } = requireActiveClient({ cfg, accountId });
      const response = await client.sendAction("get_group_list");
      if (!isActionOk(response)) {
        throw new Error(resolveActionError(response));
      }
      const data = Array.isArray(response.data) ? response.data : [];
      const q = query?.trim().toLowerCase() ?? "";
      const entries = data
        .map((entry) => entry as Record<string, unknown>)
        .map((entry) => ({
          id: entry.group_id ?? entry.groupId,
          name: entry.group_name ?? entry.groupName ?? "",
          raw: entry,
        }))
        .filter((entry) => entry.id != null)
        .map((entry) => ({
          kind: "group" as const,
          id: String(entry.id),
          name: entry.name ? String(entry.name).trim() : undefined,
          raw: entry.raw,
        }))
        .filter((entry) => {
          if (!q) return true;
          return (
            entry.id.toLowerCase().includes(q) ||
            (entry.name?.toLowerCase().includes(q) ?? false)
          );
        });
      if (limit && limit > 0) return entries.slice(0, limit);
      return entries;
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "qq",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      const { connection, error } = parseConnectionInput(input);
      if (error) return error;
      if (!connection) {
        return "QQ requires a connection URL or --http-host/--http-port.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "qq",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "qq",
            })
          : namedConfig;
      const parsed = parseConnectionInput(input);
      if (!parsed.connection) return next;
      return applyConnectionConfig({
        cfg: next,
        accountId,
        connection: parsed.connection,
      });
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const connection = account.connection;
      if (!connection) {
        throw new Error("QQ connection not configured");
      }

      const logger = resolveLogger(ctx.runtime, ctx.log);

      await startQqClient({
        accountId: account.accountId,
        connection,
        log: logger,
        abortSignal: ctx.abortSignal,
        onEvent: (event) =>
          handleOb11Event({
            event,
            account,
            config: ctx.cfg,
            runtime: ctx.runtime,
            statusSink: (patch) => ctx.setStatus({ accountId: account.accountId, ...patch }),
          }),
      });

      ctx.log?.info(
        `[${account.accountId}] QQ client connected (${resolveConnectionBaseUrl(connection) ?? connection.type})`,
      );

    },
    stopAccount: async ({ cfg, accountId }) => {
      const resolvedAccountId = resolveOutboundAccountId(cfg, accountId);
      const client = getActiveQqClient(resolvedAccountId);
      if (client) {
        client.stop();
      }
      clearActiveQqClient(resolvedAccountId);
    },
  },
};
