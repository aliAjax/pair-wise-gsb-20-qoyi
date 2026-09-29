import type { DBState } from "./logic";
import { seedState } from "./logic";

/**
 * db 键模拟“服务端共享数据”：
 * - 所有写入先改内存再整体落盘；
 * - storage 事件把其它窗口的写入同步进来，保证多窗口同机演示。
 */
const DB_KEY = "hxwl06.db.v1";

let state: DBState = load();
const listeners = new Set<() => void>();

function load(): DBState {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DBState;
  } catch {
    // 损坏的缓存不恢复正式库，回到种子数据
  }
  const seeded = seedState();
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(seeded));
  } catch {
    // 隐私模式等场景下仅内存可用
  }
  return seeded;
}

function persist(): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(state));
  } catch {
    // 忽略写入失败，内存态仍可用于当前会话
  }
  listeners.forEach((fn) => fn());
}

/** 在最新共享状态上执行变更并提交 */
export function mutate<T>(fn: (draft: DBState) => T): T {
  const result = fn(state);
  persist();
  return result;
}

export function getState(): DBState {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== DB_KEY || !e.newValue) return;
    try {
      state = JSON.parse(e.newValue) as DBState;
      listeners.forEach((fn) => fn());
    } catch {
      // 忽略无法解析的外部写入
    }
  });
}

export function resetDB(): void {
  state = seedState();
  persist();
}
