import type { Draft } from "./types";

/**
 * 未确认草稿独立于正式库（单独的存储键）。
 * 正式记录列表只读 db；草稿只有显式“确认保存”成功后才转为正式记录。
 */
const DRAFT_KEY = "hxwl06.drafts.v1";

let drafts: Draft[] = load();
const listeners = new Set<() => void>();

function load(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as Draft[];
  } catch {
    // 损坏则不恢复草稿，避免半成品流入界面
  }
  return [];
}

function persist(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // 忽略
  }
  listeners.forEach((fn) => fn());
}

export function getDrafts(): Draft[] {
  return drafts;
}

export function subscribeDrafts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function upsertDraft(draft: Draft): void {
  const idx = drafts.findIndex((d) => d.id === draft.id);
  const next = { ...draft, updatedAt: Date.now() };
  if (idx >= 0) drafts[idx] = next;
  else drafts = [...drafts, next];
  persist();
}

export function removeDraft(id: string): void {
  drafts = drafts.filter((d) => d.id !== id);
  persist();
}

export function resetDrafts(): void {
  drafts = [];
  persist();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== DRAFT_KEY) return;
    try {
      drafts = e.newValue ? (JSON.parse(e.newValue) as Draft[]) : [];
      listeners.forEach((fn) => fn());
    } catch {
      // 忽略
    }
  });
}
