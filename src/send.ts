import type { QQMessageFormat, OB11ActionResponse, OB11MessageSegment } from "./types.js";
import { buildCqMessage } from "./cqcode.js";
import type { Ob11Client } from "./adapter.js";
import type { QQTarget } from "./targets.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac", ".silk"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);

function getExtension(url: string): string {
  const lower = url.toLowerCase();
  const queryIndex = lower.indexOf("?");
  const clean = queryIndex >= 0 ? lower.slice(0, queryIndex) : lower;
  const dotIndex = clean.lastIndexOf(".");
  return dotIndex >= 0 ? clean.slice(dotIndex) : "";
}

function guessMediaType(url: string): "image" | "record" | "video" {
  const ext = getExtension(url);
  if (AUDIO_EXTENSIONS.has(ext)) return "record";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return "image";
}

function buildSegments(params: {
  text?: string;
  replyToId?: string;
  mediaUrl?: string;
}): OB11MessageSegment[] {
  const segments: OB11MessageSegment[] = [];
  if (params.replyToId) {
    segments.push({
      type: "reply",
      data: { id: params.replyToId },
    });
  }
  if (params.text) {
    segments.push({
      type: "text",
      data: { text: params.text },
    });
  }
  if (params.mediaUrl) {
    segments.push({
      type: guessMediaType(params.mediaUrl),
      data: { file: params.mediaUrl },
    });
  }
  return segments;
}

export function buildOb11MessagePayload(params: {
  format: QQMessageFormat;
  text?: string;
  replyToId?: string;
  mediaUrl?: string;
}): string | OB11MessageSegment[] {
  if (params.format === "string") {
    return buildCqMessage({
      text: params.text,
      replyToId: params.replyToId,
      mediaUrl: params.mediaUrl,
      mediaType: params.mediaUrl ? guessMediaType(params.mediaUrl) : undefined,
    });
  }
  return buildSegments({
    text: params.text,
    replyToId: params.replyToId,
    mediaUrl: params.mediaUrl,
  });
}

export async function sendOb11Message(params: {
  client: Ob11Client;
  target: QQTarget;
  text?: string;
  replyToId?: string;
  mediaUrl?: string;
}): Promise<OB11ActionResponse> {
  const payload = buildOb11MessagePayload({
    format: params.client.messageFormat,
    text: params.text,
    replyToId: params.replyToId,
    mediaUrl: params.mediaUrl,
  });

  if (params.target.kind === "group") {
    return params.client.sendAction("send_group_msg", {
      group_id: params.target.id,
      message: payload,
    });
  }

  return params.client.sendAction("send_private_msg", {
    user_id: params.target.id,
    message: payload,
  });
}
