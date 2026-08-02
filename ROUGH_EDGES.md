# Known rough edges

Real issues that actively confuse new contributors. If you touch the area, consider fixing rather than working around.

- **Dead code paths:** `DomRenderer.handleScrollWheelEvent` is defined but its listener is commented out. `animations.css` has unused keyframes.
- **Zod type used in `Parser.ts:makeZodCmdHandler` is `ZodAny`** but callers pass object schemas. `ZodTypeAny` would be more accurate; don't tighten without checking every call site.
- **Asset loaders have no error handling.** A single broken image rejects `ImageAssetLoaderSrc.loadAll`. Audio waits for `canplaythrough` with no error listener — a broken audio file hangs startup.
- **Massive duplication between `src/index.ts` and `src/playerIndex.ts`** (~100 lines of identical YAML + identical fullscreen/scale code). If you fix one, fix the other, or extract shared bootstrap.
- **Infinite-loop guard calls `alert()`** in `DomRenderer.ts:153`. Blocks the UI thread. Prefer a silent console error + hard cap if you rewrite. (The equivalent guards in `core/state.ts` used to `alert()` too — they now just throw, keeping `core/` free of browser globals.)
- **Loading a stale save can now throw, and nothing catches it.** Path replay fails loudly when a saved path doesn't match the story (`"Invalid decision id in saved path"`, `"Could not replay decision..."`) — deliberately, since silently diverging was worse. But the save id is hardcoded to `"test"`, so saves survive script edits in the editor, and `SaveLoadMenu` calls `player.loadFromSlot` with no `try/catch`. A friendly "save is incompatible" message there is the missing piece.
- **`{and: <non-array>}` parses as vacuously true.** `getBoolExprList` in `booleanExpression.ts` returns `[]` for non-array input instead of a `ParserError`, so `{and: "oops"}` becomes `And([])` which evaluates `true` (and `{or: "oops"}` evaluates `false`). Should be a parse error.
- **Comparison operators don't type-check.** `["$name", "<", 5]` in a boolean expression does raw JS coercion, unlike the `set` command's arithmetic operators in `variables.ts` which throw on mixed types. Inconsistent; probably worth aligning.
- **`ConsecutiveIntegerSet.toJSON` returns its internal array by reference** (the `should deep clone..?` TODO is right). Callers currently `JSON.stringify` immediately so nothing breaks today, but holding onto the returned value and mutating the set will corrupt it.
