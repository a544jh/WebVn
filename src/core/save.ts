import { Intervals } from "../lib/ConsequtiveIntegerSet"

export interface VnGlobalSaveData {
  seenCommands: Intervals
  saves: VnSaveSlotData[]
}

export interface VnSaveSlotData {
  timestamp: number
  path: number[]
}

export function saveToLocalStorage(id: string, save: VnGlobalSaveData): void {
  const key = `vn-${id}`
  const data = JSON.stringify(save)
  window.localStorage.setItem(key, data)
}

export function loadFromLocalStorage(id: string): VnGlobalSaveData {
  const key = `vn-${id}`
  const data = window.localStorage.getItem(key)
  if (data === null) throw new Error("Could not load save data for " + key)
  return JSON.parse(data)
}
