import type { Ob11Client } from "./adapter.js";
import type { QQTarget } from "./targets.js";
import type { QQMessageFormat, OB11ActionResponse, OB11MessageSegment } from "./types.js";
import { buildCqMessage } from "./cqcode.js";
import { readFileSync, existsSync } from "fs";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac", ".silk", ".m4a"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]);

// OneBot 11 文件大小限制 (建议)
const FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB

function getExtension(url: string): string {
  const lower = url.toLowerCase();
  const queryIndex = lower.indexOf("?");
  const clean = queryIndex >= 0 ? lower.slice(0, queryIndex) : lower;
  const dotIndex = clean.lastIndexOf(".");
  return dotIndex >= 0 ? clean.slice(dotIndex) : "";
}

function guessMediaType(path: string): "image" | "record" | "video" | "file" {
  const ext = getExtension(path);
  const imageExt = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);
  const audioExt = new Set([".mp3", ".wav", ".ogg", ".flac", ".silk", ".m4a"]);
  const videoExt = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]);
  
  if (audioExt.has(ext)) return "record";
  if (videoExt.has(ext)) return "video";
  if (imageExt.has(ext)) return "image";
  return "file";
}

function isLocalPath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("./") || path.startsWith("../");
}

function getFileSize(filePath: string): number {
  try {
    return readFileSync(filePath).length;
  } catch {
    return 0;
  }
}

export function buildOb11MessagePayload(params: {
  format: QQMessageFormat;
  text?: string;
  replyToId?: string;
  mediaUrl?: string;
}): string | OB11MessageSegment[] {
  const mediaType = params.mediaUrl ? guessMediaType(params.mediaUrl) : undefined;
  
  if (params.format === "string") {
    return buildCqMessage({
      text: params.text,
      replyToId: params.replyToId,
      mediaUrl: params.mediaUrl,
      mediaType,
    });
  }
  
  const segments: OB11MessageSegment[] = [];
  
  if (params.replyToId) {
    segments.push({ type: "reply", data: { id: params.replyToId } });
  }
  
  if (params.text) {
    segments.push({ type: "text", data: { text: params.text } });
  }
  
  if (params.mediaUrl) {
    segments.push({ type: mediaType || "image", data: { file: params.mediaUrl } });
  }
  
  return segments;
}

export async function sendOb11Message(params: {
  client: Ob11Client;
  target: QQTarget;
  text?: string;
  replyToId?: string;
  mediaUrl?: string;
}): Promise<OB11ActionResponse> {
  // 处理本地文件 - 使用 CQ码 方式发送
  if (params.mediaUrl && isLocalPath(params.mediaUrl)) {
    console.error(`[DEBUG] Processing local file: ${params.mediaUrl}`);
    
    const fileName = params.mediaUrl.split("/").pop() || "file";
    const mediaType = guessMediaType(params.mediaUrl);
    
    // 使用 CQ码 方式发送本地文件
    // image 类型使用 file 字段
    // 其他类型（record/video）也使用 file 字段
    const cqCode = `[CQ:${mediaType},file=${params.mediaUrl}]`;
    
    const fullMessage = params.text 
      ? `${params.text}\n${cqCode}`
      : cqCode;
    
    console.error(`[DEBUG] Sending file via CQ code: ${cqCode}`);
    
    if (params.target.kind === "group") {
      return params.client.sendAction("send_group_msg", {
        group_id: params.target.id,
        message: fullMessage,
      });
    }
    
    return params.client.sendAction("send_private_msg", {
      user_id: params.target.id,
      message: fullMessage,
    });
  }
  
  // 普通消息或远程媒体
  const payload = buildOb11MessagePayload({
    format: params.client.messageFormat,
    text: params.text,
    replyToId: params.replyToId,
    mediaUrl: params.mediaUrl,
  });

  console.error(`[DEBUG] Sending OB11 message: ${JSON.stringify(payload)}`);

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
