import type { OB11MessageSegment } from "./types.js";
import { parseCqSegments, renderCqSegments } from "./cqcode.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// OneBot HTTP API 配置
const OB11_API_BASE = "http://127.0.0.1:3000";

// 本地图片存储目录
const IMAGE_STORAGE_DIR = process.env.QQ_IMAGE_DIR || "/tmp/qq-images";

export type ParsedMessage = {
  text: string;
  mentions: string[];
  replyToId?: string;
  media?: Array<{
    type: "image" | "audio" | "video";
    data: string; // 本地文件路径
    mimeType?: string;
  }>;
};

function toSegmentString(value?: string | number): string {
  if (value == null) return "";
  return String(value);
}

// 确保图片存储目录存在
async function ensureImageDir(): Promise<string> {
  if (!existsSync(IMAGE_STORAGE_DIR)) {
    await mkdir(IMAGE_STORAGE_DIR, { recursive: true });
  }
  return IMAGE_STORAGE_DIR;
}

// 生成唯一的文件名
function generateFileName(ext: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `qq_${timestamp}_${random}${ext}`;
}

// 调用 OneBot API 获取图片本地路径
async function getImageLocalPath(fileId: string): Promise<string | null> {
  try {
    const response = await fetch(`${OB11_API_BASE}/get_image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: fileId }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.status === "ok" && result.data?.file) {
      return result.data.file;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// 下载文件并保存到本地
async function downloadAndSaveFile(
  filePathOrUrl: string,
  segmentType: string
): Promise<{ localPath: string; mimeType: string } | null> {
  try {
    // 如果是图片，先尝试通过OneBot API获取本地路径
    if (segmentType === "image" && filePathOrUrl.includes("multimedia.nt.qq.com.cn")) {
      const urlObj = new URL(filePathOrUrl);
      const fileId = urlObj.searchParams.get("fileid");
      if (fileId) {
        const localPath = await getImageLocalPath(fileId);
        if (localPath && existsSync(localPath)) {
          return {
            localPath,
            mimeType: guessMimeType(localPath),
          };
        }
      }
    }

    // 判断是本地文件路径还是URL
    const isLocalFile = !filePathOrUrl.startsWith("http://") && !filePathOrUrl.startsWith("https://");

    if (isLocalFile) {
      // 已经是本地文件，直接返回
      if (existsSync(filePathOrUrl)) {
        return {
          localPath: filePathOrUrl,
          mimeType: guessMimeType(filePathOrUrl),
        };
      }
      return null;
    } else {
      // 下载远程文件
      const response = await fetch(filePathOrUrl);
      if (!response.ok) return null;
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get("content-type") || guessMimeType(filePathOrUrl);
      const ext = getExtensionFromMimeType(mimeType) || ".bin";
      
      // 保存到本地
      const imageDir = await ensureImageDir();
      const fileName = generateFileName(ext);
      const localPath = path.join(imageDir, fileName);
      
      await writeFile(localPath, buffer);
      
      return { localPath, mimeType };
    }
  } catch (err) {
    return null;
  }
}

function guessMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".silk")) return "audio/silk";
  return "application/octet-stream";
}

function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/silk": ".silk",
  };
  return map[mimeType] || ".bin";
}

async function renderOb11Segments(segments: OB11MessageSegment[]): Promise<ParsedMessage> {
  const parts: string[] = [];
  const mentions: string[] = [];
  const media: ParsedMessage["media"] = [];
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
        const result = await downloadAndSaveFile(file, segment.type);
        if (result) {
          const mediaType = segment.type === "image" ? "image" : 
                           segment.type === "record" ? "audio" : "video";
          media.push({
            type: mediaType,
            data: result.localPath, // 本地文件路径
            mimeType: result.mimeType,
          });
          // 在文本中显示本地路径
          parts.push(`[${mediaType.toUpperCase()}: ${result.localPath}]`);
        } else {
          parts.push(`Attachment: ${file}`);
        }
      }
      continue;
    }
  }

  return {
    text: parts.join("").trim(),
    mentions,
    replyToId,
    media: media.length > 0 ? media : undefined,
  };
}

export async function parseOb11Message(
  message?: string | OB11MessageSegment[],
): Promise<ParsedMessage> {
  if (!message) {
    return { text: "", mentions: [] };
  }
  if (typeof message === "string") {
    const segments = parseCqSegments(message);
    const ob11Segments: OB11MessageSegment[] = segments.map(s => ({
      type: s.type,
      data: Object.fromEntries(
        Object.entries(s.data).map(([k, v]) => [k, typeof v === "number" ? v : String(v)])
      ),
    }));
    return renderOb11Segments(ob11Segments);
  }
  return renderOb11Segments(message);
}

export function hasSelfMention(mentions: string[], selfId?: string): boolean {
  if (mentions.includes("all")) return true;
  if (!selfId) return false;
  return mentions.includes(selfId);
}
