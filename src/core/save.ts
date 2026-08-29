import { Intervals } from "../lib/ConsecutiveIntegerSet"

export interface VnGlobalSaveData {
  seenCommands: Intervals
  saves: VnSaveSlotData[]
}

export interface VnSaveSlotData {
  timestamp: number
  path: number[]
}

// localStorage is origin-wide and shared with whatever else the app keeps there, so an
// author-chosen id needs a keyspace of its own: a project called `theme` must not be able to sit on
// top of a setting called `theme`. The two-level prefix is design-docs/PROJECT_STORAGE.md's, and it
// leaves `vn-editor-*` free for the app's own half.
const saveKey = (id: string): string => `vn-save-${id}`

export function saveToLocalStorage(id: string, save: VnGlobalSaveData): void {
  const key = saveKey(id)
  const data = JSON.stringify(save)
  window.localStorage.setItem(key, data)
}

export function loadFromLocalStorage(id: string): VnGlobalSaveData {
  const key = saveKey(id)
  const data = window.localStorage.getItem(key)
  if (data === null) throw new Error("Could not load save data for " + key)
  return JSON.parse(data)
}
