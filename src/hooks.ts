import { useSyncExternalStore } from "react";
import { getState, subscribe } from "./db";
import { getDrafts, subscribeDrafts } from "./drafts";

export function useDB() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useDrafts() {
  return useSyncExternalStore(subscribeDrafts, getDrafts, getDrafts);
}
