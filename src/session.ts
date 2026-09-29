import { useSyncExternalStore } from "react";

/**
 * 当前操作人：按浏览器窗口（标签页）隔离，
 * 模拟同一台电脑前后两个人分别操作。
 * 关窗后选择不保留，重开需重新选定身份；草稿上始终记录最后编辑人。
 */
const KEY = "hxwl06.operator";

function getSnapshot(): string {
  return sessionStorage.getItem(KEY) ?? "";
}

function subscribe(cb: () => void): () => void {
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  // 同窗口内 sessionStorage 不触发 storage 事件，用自定义事件兜底
  const localHandler = () => cb();
  window.addEventListener("storage", storageHandler);
  window.addEventListener("hxwl06-operator", localHandler);
  return () => {
    window.removeEventListener("storage", storageHandler);
    window.removeEventListener("hxwl06-operator", localHandler);
  };
}

export function useOperator(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}

export function setOperator(name: string): void {
  const trimmed = name.trim();
  if (trimmed) sessionStorage.setItem(KEY, trimmed);
  else sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event("hxwl06-operator"));
}
