# Known rough edges

Real issues that actively confuse new contributors. If you touch the area, consider fixing rather than working around.

- **`VnPath.undo` contains `stepsLeft -= stepsLeft`**. Works by accident (exits loop at 0). Harmless, but don't copy-paste.
- **Dead code paths:** `DomRenderer.handleScrollWheelEvent` is defined but its listener is commented out. `animations.css` has unused keyframes.
- **Zod type used in `Parser.ts:makeZodCmdHandler` is `ZodAny`** but callers pass object schemas. `ZodTypeAny` would be more accurate; don't tighten without checking every call site.
- **Asset loaders have no error handling.** A single broken image rejects `ImageAssetLoaderSrc.loadAll`. Audio waits for `canplaythrough` with no error listener — a broken audio file hangs startup.
- **Massive duplication between `src/index.ts` and `src/playerIndex.ts`** (~100 lines of identical YAML + identical fullscreen/scale code). If you fix one, fix the other, or extract shared bootstrap.
- **Infinite-loop guard calls `alert()`** in `DomRenderer.ts:153`. Blocks the UI thread. Prefer a silent console error + hard cap if you rewrite. (The equivalent guards in `core/state.ts` used to `alert()` too — they now just throw, keeping `core/` free of browser globals.)
