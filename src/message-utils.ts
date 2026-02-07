import type { OB11MessageSegment } from "./types.js";
import { parseCqSegments, renderCqSegments } from "./cqcode.js";

export type ParsedMessage = {
  text: string;
  mentions: string[];
  replyToId?: string;
};

function toSegmentString(value?: string | number): string {
  if (value == null) return "";
  return String(value);
}

function renderOb11Segments(segments: OB11MessageSegment[]): ParsedMessage {
  const parts: string[] = [];
  const mentions: string[] = [];
  let replyToId: string | undefined;

  for (const segment of segments) {
    if (segment.type === "text") {
      const text = toSegmentString(segment.data.text);
      if (text) parts.push(text);
      continue;
    }
    if (segment.type === "at") {
      const target = toSegmentString(segment.data.qq);
      if (target) {
        mentions.push(target);
        parts.push(target === "all" ? "@all" : `@${target}`);
      }
      continue;
    }
    if (segment.type === "reply") {
      const id = toSegmentString(segment.data.id);
      if (id) replyToId = id;
      continue;
    }
    if (segment.type === "image" || segment.type === "record" || segment.type === "video") {
      const file = toSegmentString(segment.data.url) || toSegmentString(segment.data.file);
      if (file) {
        parts.push(`Attachment: ${file}`);
      }
      continue;
    }
  }

  return {
    text: parts.join("").trim(),
    mentions,
    replyToId,
  };
}

export function parseOb11Message(message?: string | OB11MessageSegment[]): ParsedMessage {
  if (!message) {
    return { text: "", mentions: [] };
  }
  if (typeof message === "string") {
    const segments = parseCqSegments(message);
    return renderCqSegments(segments);
  }
  return renderOb11Segments(message);
}

export function hasSelfMention(mentions: string[], selfId?: string): boolean {
  if (mentions.includes("all")) return true;
  if (!selfId) return false;
  return mentions.includes(selfId);
}
