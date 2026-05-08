# Known rough edges

Real issues that actively confuse new contributors. If you touch the area, consider fixing rather than working around.

- **Typos that travel through imports:**
  - `src/lib/ConsequtiveIntegerSet.ts` (class is spelled correctly as `ConsecutiveIntegerSet`)
  - `transitonDuration` in `state.ts`, `Background.ts`, `BackgroundRenderer.ts`
  - `lable` / `lables` in `Label.ts` (`updateLabels`)
  - `postion` in `Show.ts`
  - Wrong error text in `Jump.ts:34` — says `"of"` should say `"to"`
- **`seenCommands` is the one mutable field on `VnPlayerState`.** `state.ts:155` mutates it during `advance()`, and the same set is shared across every snapshot. Undo will not un-see commands. If this surprises you, either move it off state onto `VnPlayer`, or make it immutable — but do so deliberately; save format depends on it.
- **`VnPath.undo` contains `stepsLeft -= stepsLeft`**. Works by accident (exits loop at 0). Harmless, but don't copy-paste.
- **Dead code paths:** `DomRenderer.handleScrollWheelEvent` is defined but its listener is commented out. `animations.css` has unused keyframes.
- **Zod type used in `Parser.ts:makeZodCmdHandler` is `ZodAny`** but callers pass object schemas. `ZodTypeAny` would be more accurate; don't tighten without checking every call site.
- **Editor is not "live":** `parseDocument` runs only on `goToLine` / blur, not on every keystroke. The README overstates this.
- **Asset loaders have no error handling.** A single broken image rejects `ImageAssetLoaderSrc.loadAll`. Audio waits for `canplaythrough` with no error listener — a broken audio file hangs startup.
- **Massive duplication between `src/index.ts` and `src/playerIndex.ts`** (~100 lines of identical YAML + identical fullscreen/scale code). If you fix one, fix the other, or extract shared bootstrap.
- **Infinite-loop guards call `alert()`** in `state.ts:198` and `DomRenderer.ts:153`. Blocks the UI thread. Prefer a silent console error + hard cap if you rewrite.
