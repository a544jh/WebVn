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

// Saves are keyed by the manifest's id, so anything that changes which id a project answers to has
// to move them - and anything that destroys a project has to take them with it. Neither is tidiness:
// an id is reusable, and a save left behind under one is a save the *next* project to claim that id
// inherits. Its paths describe a story that project does not have, and replaying one throws.
//
// `to` is cleared when `from` has nothing, which is the case that matters most: renaming onto an
// existing project destroys it, and its saves must not be left behind to greet whatever arrives.
export function moveSaveData(from: string, to: string): void {
  const data = window.localStorage.getItem(saveKey(from))
  if (data === null) {
    deleteSaveData(to)
    return
  }
  window.localStorage.setItem(saveKey(to), data)
  deleteSaveData(from)
}

export function deleteSaveData(id: string): void {
  window.localStorage.removeItem(saveKey(id))
}

// What both entry points want: this project's saves if there are any, and a fresh start if there are
// not. A first run has no key, which throws, and neither entry point can do anything useful with
// that - so the absence is swallowed here rather than in the same seven lines copied into each of
// them, which is what ROUGH_EDGES.md's "duplicated bootstrap" entry named.
//
// It swallows a *corrupt* save too, which is deliberate but not free: nothing beyond JSON.parse
// validates the shape (see the entry above this function), so a save that parses into the wrong
// shape still loads and fails later. That is the same rough edge, not a new one.
export function loadSaveData(id: string): VnGlobalSaveData | undefined {
  try {
    return loadFromLocalStorage(id)
  } catch (e) {
    return undefined
  }
}
