export type QQTarget = {
  kind: "group" | "private";
  id: string;
};

export function stripQqPrefix(value: string): string {
  return value.trim().replace(/^qq:/i, "");
}

export function parseQqTarget(raw: string): QQTarget | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = stripQqPrefix(trimmed);
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("group:")) {
    const id = cleaned.slice("group:".length).trim();
    return id ? { kind: "group", id } : null;
  }
  if (lower.startsWith("g:")) {
    const id = cleaned.slice("g:".length).trim();
    return id ? { kind: "group", id } : null;
  }
  if (lower.startsWith("user:")) {
    const id = cleaned.slice("user:".length).trim();
    return id ? { kind: "private", id } : null;
  }
  return { kind: "private", id: cleaned };
}

export function formatQqTarget(target: QQTarget): string {
  if (target.kind === "group") {
    return `group:${target.id}`;
  }
  return target.id;
}

export function normalizeAllowEntry(raw: string): string {
  const cleaned = stripQqPrefix(raw).trim();
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("group:")) {
    return `group:${cleaned.slice("group:".length).trim()}`;
  }
  if (lower.startsWith("g:")) {
    return `group:${cleaned.slice("g:".length).trim()}`;
  }
  if (lower.startsWith("user:")) {
    return cleaned.slice("user:".length).trim();
  }
  return cleaned;
}
