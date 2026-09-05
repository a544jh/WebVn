import { writeManifest, writeScript } from "./projectStore"

// What turns the editor's keystrokes into files in the project store: a debounce, the three flushes
// that try to catch a tab going away, and the state the indicator shows.
//
// Vocabulary: the editor *stores* the author's project and the store *writes* files. A **save** is
// the player's - a save slot holding a path through a story - and the two are unrelated. CONTEXT.md
// has the entry, with "autosave" on its _Avoid_ list.
//
// It is deliberately not a member of VnEditor and does not import it: storage stays out of
// src/editor/, the pixel stays in the tab bar, and neither imports the other. Both entry points wire
// the two together in the two lines it takes.

// The three values src/editor/editor.ts's StoreState spells; see that type for why they are written
// in both places rather than shared.
export type StoreState = "stored" | "unstored" | "failed"

export type StoredBuffer = "script" | "manifest"

// 2000ms after the last keystroke. **The debounce is the guarantee and every flush is a bonus** -
// no unload-time hook can promise an async OPFS write completes, and `sendBeacon`, the one mechanism
// with a delivery guarantee, is network-only and no help here. So do not lengthen this interval on
// the theory that the flushes cover it. They do not.
export const STORE_DEBOUNCE_MS = 2000

export class ProjectStoring {
  private pending = new Map<StoredBuffer, string>()
  private timer: number | null = null
  private writing: Promise<void> = Promise.resolve()

  // Addressed by **directory**, never by the manifest's id. An author who edits `id:` in the buffer
  // has made the two disagree, which is exactly the state ProjectSummary reports and the rename
  // ticket resolves - so nothing here re-derives a path from the id, and nothing rewrites the id to
  // match the directory, which the design doc calls out as the wrong direction and the cheap one.
  constructor(private directory: string, private onStateChange: (state: StoreState) => void, editorRoot: HTMLElement) {
    // Blur is the flush an author actually feels: they click the preview and their work is down.
    editorRoot.addEventListener("focusout", () => void this.flush())

    // Not `unload`: it suppresses bfcache, Chrome is deprecating it, and mobile browsers routinely
    // kill a backgrounded tab without ever firing it. `pagehide` is strictly better and fires on
    // bfcache entry too, but visibility going hidden is the signal that catches a mobile
    // app-switch, which is the last moment before a background kill.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flush()
    })
    window.addEventListener("pagehide", () => void this.flush())
  }

  // **Nothing removes those three listeners, and project switching must not land without changing
  // that.** One storer per page load is all there is today, so the page going away is the teardown -
  // but the picker brings a second boot in the same page, and a superseded storer keeps listening.
  //
  // Measured 2026-09-05, not guessed: boot on project A, type without waiting out the debounce, boot
  // on project B, fire `visibilitychange`, and A's storer writes its pending text to A. The write
  // itself is harmless - it is A's own work going to A. The loss is on a switch *back*: A then has
  // two storers, the stale one holds older text, and it queues its flush later. Per-path
  // serialization makes the last *queued* write win, so the older text lands on top of the newer.
  //
  // The fix when that day comes is an AbortController owned here, `{ signal }` on the three
  // listeners above, and a `stop()` the teardown calls - about five lines. It is not built now
  // because nothing in the app would call it, which is the same rule that keeps `release` off
  // `AssetResolver`.

  // One buffer's whole text, as it stands. Stored as the buffer rather than as a parse: a manifest
  // that does not parse is still the author's work, and reloading gives it back with the gutter
  // marked, which is what ADR 0002 already does in-session. Gating the write on a successful parse
  // would mean the one edit an author most wants back after a crash is the one not written.
  public changed(buffer: StoredBuffer, text: string): void {
    this.pending.set(buffer, text)
    this.onStateChange("unstored")
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => void this.flush(), STORE_DEBOUNCE_MS)
  }

  // Write whatever is pending now. Safe to call when nothing is: it resolves without touching the
  // store or the indicator.
  public flush(): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.size === 0) return this.writing

    const batch = this.pending
    this.pending = new Map()
    // Chained rather than started, so two flushes in flight cannot report out of order - the store's
    // own per-path serialization already makes the *files* safe, and this is what makes the
    // *indicator* honest about which write it is reporting.
    this.writing = this.writing.catch(() => undefined).then(() => this.write(batch))
    return this.writing
  }

  private async write(batch: Map<StoredBuffer, string>): Promise<void> {
    try {
      for (const [buffer, text] of batch) {
        if (buffer === "script") await writeScript(this.directory, text)
        else await writeManifest(this.directory, text)
      }
    } catch (e) {
      // The only place a quota error surfaces in tranche 1. A dialog would be over-engineering; the
      // indicator says so and the console carries the error.
      console.error("Could not store the project", e)
      this.onStateChange("failed")
      return
    }
    // Only when nothing arrived while this was in flight - otherwise the indicator would claim
    // stored over an edit still waiting for its debounce.
    if (this.pending.size === 0) this.onStateChange("stored")
  }
}
