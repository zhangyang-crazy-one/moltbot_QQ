import { DmPolicySchema, GroupPolicySchema, MarkdownConfigSchema } from "clawdbot/plugin-sdk";
import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

const wsConnectionSchema = z.object({
  type: z.literal("ws"),
  host: z.string(),
  port: z.number(),
  token: z.string().optional(),
  heartInterval: z.number().optional(),
  messageFormat: z.enum(["array", "string"]).default("array"),
  reportSelfMessage: z.boolean().optional(),
  reportOfflineMessage: z.boolean().optional(),
});

const httpConnectionSchema = z.object({
  type: z.literal("http"),
  host: z.string(),
  port: z.number(),
  token: z.string().optional(),
  messageFormat: z.enum(["array", "string"]).default("array"),
  reportSelfMessage: z.boolean().optional(),
  reportOfflineMessage: z.boolean().optional(),
});

const httpPostConnectionSchema = z.object({
  type: z.literal("http-post"),
  url: z.string(),
  token: z.string().optional(),
  messageFormat: z.enum(["array", "string"]).default("array"),
  reportSelfMessage: z.boolean().optional(),
  reportOfflineMessage: z.boolean().optional(),
});

const wsReverseConnectionSchema = z.object({
  type: z.literal("ws-reverse"),
  url: z.string(),
  token: z.string().optional(),
  heartInterval: z.number().optional(),
  messageFormat: z.enum(["array", "string"]).default("array"),
  reportSelfMessage: z.boolean().optional(),
  reportOfflineMessage: z.boolean().optional(),
});

const connectionSchema = z.discriminatedUnion("type", [
  wsConnectionSchema,
  httpConnectionSchema,
  httpPostConnectionSchema,
  wsReverseConnectionSchema,
]);

const qqAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  markdown: MarkdownConfigSchema.optional(),
  connection: connectionSchema.optional(),
  allowFrom: z.array(allowFromEntry).optional(),
  groupAllowFrom: z.array(allowFromEntry).optional(),
  dmPolicy: DmPolicySchema.optional(),
  groupPolicy: GroupPolicySchema.optional(),
  requireMention: z.boolean().optional(),
});

export const QQConfigSchema = qqAccountSchema.extend({
  accounts: z.object({}).catchall(qqAccountSchema).optional(),
  defaultAccount: z.string().optional(),
});
