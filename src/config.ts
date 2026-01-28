import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "clawdbot/plugin-sdk";

import type { QQAccountConfig, QQConfig, QQConnectionConfig, ResolvedQQAccount } from "./types.js";

function listConfiguredAccountIds(cfg: ClawdbotConfig): string[] {
  const accounts = (cfg.channels?.qq as QQConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

export function listQqAccountIds(cfg: ClawdbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultQqAccountId(cfg: ClawdbotConfig): string {
  const qqConfig = cfg.channels?.qq as QQConfig | undefined;
  if (qqConfig?.defaultAccount?.trim()) return qqConfig.defaultAccount.trim();
  const ids = listQqAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: ClawdbotConfig,
  accountId: string,
): QQAccountConfig | undefined {
  const accounts = (cfg.channels?.qq as QQConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as QQAccountConfig | undefined;
}

function mergeQqAccountConfig(cfg: ClawdbotConfig, accountId: string): QQAccountConfig {
  const raw = (cfg.channels?.qq ?? {}) as QQConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

const SUPPORTED_CONNECTION_TYPES = new Set<QQConnectionConfig["type"]>(["ws", "http"]);

export function isConnectionConfigured(connection?: QQConnectionConfig): boolean {
  if (!connection) return false;
  if (!SUPPORTED_CONNECTION_TYPES.has(connection.type)) return false;
  return Boolean(connection.host && connection.port);
}

export function resolveConnectionIssue(connection?: QQConnectionConfig): string | null {
  if (!connection) return "missing connection";
  if (!SUPPORTED_CONNECTION_TYPES.has(connection.type)) {
    return `connection type not supported yet: ${connection.type}`;
  }
  if (!connection.host?.trim()) return "connection host is missing";
  if (!connection.port) return "connection port is missing";
  return null;
}

export function resolveQqAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): ResolvedQQAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = (params.cfg.channels?.qq as QQConfig | undefined)?.enabled !== false;
  const merged = mergeQqAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const connection = merged.connection;
  const configured = isConnectionConfigured(connection);

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    configured,
    config: merged,
    connection,
  };
}

export function listEnabledQqAccounts(cfg: ClawdbotConfig): ResolvedQQAccount[] {
  return listQqAccountIds(cfg)
    .map((accountId) => resolveQqAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
