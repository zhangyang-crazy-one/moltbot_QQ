import type { DmPolicy, GroupPolicy, MarkdownConfig } from "openclaw/plugin-sdk";

export type QQMessageFormat = "array" | "string";

export type QQWsConnectionConfig = {
  type: "ws";
  host: string;
  port: number;
  token?: string;
  heartInterval?: number;
  messageFormat?: QQMessageFormat;
  reportSelfMessage?: boolean;
  reportOfflineMessage?: boolean;
};

export type QQHttpConnectionConfig = {
  type: "http";
  host: string;
  port: number;
  token?: string;
  messageFormat?: QQMessageFormat;
  reportSelfMessage?: boolean;
  reportOfflineMessage?: boolean;
};

export type QQHttpPostConnectionConfig = {
  type: "http-post";
  url: string;
  token?: string;
  messageFormat?: QQMessageFormat;
  reportSelfMessage?: boolean;
  reportOfflineMessage?: boolean;
};

export type QQWsReverseConnectionConfig = {
  type: "ws-reverse";
  url: string;
  token?: string;
  heartInterval?: number;
  messageFormat?: QQMessageFormat;
  reportSelfMessage?: boolean;
  reportOfflineMessage?: boolean;
};

export type QQConnectionConfig =
  | QQWsConnectionConfig
  | QQHttpConnectionConfig
  | QQHttpPostConnectionConfig
  | QQWsReverseConnectionConfig;

export type QQGroupConfig = {
  requireMention?: boolean;
  agentId?: string;
  enabled?: boolean;
};

export type QQAccountConfig = {
  name?: string;
  enabled?: boolean;
  markdown?: MarkdownConfig;
  connection?: QQConnectionConfig;
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  dmPolicy?: DmPolicy;
  groupPolicy?: GroupPolicy;
  requireMention?: boolean;
  groups?: Record<string, QQGroupConfig>;
};

export type QQConfig = QQAccountConfig & {
  accounts?: Record<string, QQAccountConfig>;
  defaultAccount?: string;
};

export type ResolvedQQAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  config: QQAccountConfig;
  connection?: QQConnectionConfig;
};

export type OB11MessageSegment = {
  type: string;
  data: Record<string, string | number>;
};

export type OB11MessageSender = {
  user_id?: number;
  nickname?: string;
  card?: string;
};

export type OB11MessageEvent = {
  post_type?: string;
  message_type?: "private" | "group";
  message?: string | OB11MessageSegment[];
  raw_message?: string;
  message_id?: number | string;
  sub_type?: string;
  user_id?: number;
  group_id?: number;
  self_id?: number;
  time?: number;
  sender?: OB11MessageSender;
};

export type OB11Event = OB11MessageEvent & Record<string, unknown>;

export type OB11ActionResponse<T = unknown> = {
  status?: string;
  retcode?: number;
  data?: T;
  msg?: string;
  echo?: string | number;
};
