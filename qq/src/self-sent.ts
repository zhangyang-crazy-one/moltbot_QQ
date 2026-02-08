import type { OB11ActionResponse } from "./types.js";

const SELF_SENT_TTL_MS = 2 * 60_000;
const MAX_PER_ACCOUNT = 200;

type SelfSentRecord = {
  messageId?: string;
  target: string;
  text?: string;
  timestamp: number;
};

const selfSentByAccount = new Map<string, SelfSentRecord[]>();

function normalizeText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function pruneStore(records: SelfSentRecord[]): void {
  const cutoff = Date.now() - SELF_SENT_TTL_MS;
  let next = records.filter((record) => record.timestamp >= cutoff);
  if (next.length > MAX_PER_ACCOUNT) {
    next = next.slice(next.length - MAX_PER_ACCOUNT);
  }
  records.length = 0;
  records.push(...next);
}

function getStore(accountId: string): SelfSentRecord[] {
  let store = selfSentByAccount.get(accountId);
  if (!store) {
    store = [];
    selfSentByAccount.set(accountId, store);
  }
  return store;
}

export function extractMessageIdFromResponse(response: OB11ActionResponse): string | undefined {
  const data = response.data as Record<string, unknown> | undefined;
  const messageId = data?.message_id ?? data?.messageId;
  if (typeof messageId === "number" || typeof messageId === "string") {
    return String(messageId);
  }
  return undefined;
}

export function rememberSelfSentMessage(params: {
  accountId: string;
  messageId?: string | null;
  target: string;
  text?: string;
}): void {
  const messageId = params.messageId ? String(params.messageId) : undefined;
  const text = normalizeText(params.text);
  if (!messageId && !text) return;
  const store = getStore(params.accountId);
  store.push({
    messageId,
    target: params.target,
    text,
    timestamp: Date.now(),
  });
  pruneStore(store);
}

export function rememberSelfSentResponse(params: {
  accountId: string;
  response: OB11ActionResponse;
  target: string;
  text?: string;
}): void {
  rememberSelfSentMessage({
    accountId: params.accountId,
    messageId: extractMessageIdFromResponse(params.response),
    target: params.target,
    text: params.text,
  });
}

export function wasSelfSentMessage(params: {
  accountId: string;
  messageId?: string | null;
  target: string;
  text?: string;
}): boolean {
  const messageId = params.messageId ? String(params.messageId) : undefined;
  const text = normalizeText(params.text);
  if (!messageId && !text) return false;
  const store = selfSentByAccount.get(params.accountId);
  if (!store) return false;
  pruneStore(store);
  return store.some((record) => {
    if (messageId && record.messageId === messageId) return true;
    if (text && record.text === text && record.target === params.target) return true;
    return false;
  });
}
