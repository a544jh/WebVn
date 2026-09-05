# The editor boots from the store, and stores into it

Status: done (2026-08-30)

The ticket an author would notice: what they type survives a reload. Needs 01, 03 and 04. Four
pieces - the OPFS resolver that ticket 01 left unwritten, a boot path that reads a project instead of
importing one, storing, and the indicator that says whether storing has happened.

**Vocabulary**: the editor *stores* the author's project; the store *writes* files. A *save* is the
player's - a save slot holding a path through a story - and the two are unrelated. `CONTEXT.md` has
the entry. Do not write "autosave" anywhere in this ticket's code or comments.

## 1. `OpfsAssetResolver`

Ticket 01's second implementation, and the one it exists for.

```ts
// resolve("assets/sprites/A1/idle.png")
//   -> readBlob(root, "projects/my-story/assets/sprites/A1/idle.png")
//   -> URL.createObjectURL(blob)
```

Constructed with the project's directory, which is the only thing it needs to know. It mints one
object URL per path and **never revokes** - the loaders never evict, so a revoked URL would break the
`cloneNode()` every `getAsset` hands out, which is what ticket 02 pins. Say that in a comment beside
`createObjectURL`, pointing at the test, because "we made this URL, we should clean it up" is the
obvious-looking change that breaks it.

A path the store does not have rejects, and `loadAll` reports it like any other missing file - so the
editor's existing "declared file that is not there" warning, marked on the manifest line that
declared it, works over OPFS with no further change. That is the payoff for keeping the logical path
as the loader's key.

## 2. Boot

`src/index.ts` today ends in `editor.loadProject(demoManifestYaml, demoYaml)` and builds the player
from `demoManifest` at module top. Booting becomes, in order:

1. `isSupported()`. If not, **the editor does not load**: show the refusal below and stop.
2. Read `editor.yaml`; take `lastOpened`, else the first entry of `listProjects()`.
3. If the library is empty, seed the demo (below) and open it.
4. `readProject(directory)` -> `parseManifest(manifestText)` -> `seedState(manifest)` ->
   `loadFromLocalStorage(manifest.id)` -> `new VnPlayer(...)`. The save key comes from the manifest
   that was just read, which is what `seedState` copying `id` onto the state is for.
5. `new DomRenderer(root, player, container, new OpfsAssetResolver(directory))`, then `new VnEditor(...)`,
   then `editor.loadProject(manifestText, scriptText)`.
6. Write `lastOpened` back.

The whole of this is async, where the current file is synchronous top-to-bottom. Keep the existing
`renderer.onRenderCallbacks` debug wiring and the export-URL button wiring **inside** the boot
function, where the objects exist - `src/playerIndex.ts` already has this shape and the same reason
for it, so follow it rather than inventing a second one.

A manifest that does not parse must still open: mount the editor with the last-known-good manifest
the constructor requires... which does not exist on a cold boot. Simplest honest answer: if the
stored manifest does not parse, boot the editor with `seedState` of a minimal placeholder manifest
and both buffers holding the author's real text, so the gutter marks it and they can fix it. Whatever
is chosen, it must not be "refuse to open the project" - that is the state ticket 04 deliberately
keeps listable.

### There is no memory-only editor

A browser without OPFS gets no editor at all - one message, the way `showLoadError` already refuses
for the player, and nothing mounted. **Do not add a fallback that boots the demo from the compiled-in
constants and quietly stores nothing.** That is a second boot path that behaves differently, is
exercised by nobody, and has no owner; and an editor that silently cannot keep the author's work is
worse than one that says so up front. The blast radius is small on purpose: `src/playerIndex.ts`
never touches OPFS, so the *player* still works in any browser, and it is only authoring that needs
a place to put things.

This is also why the storing indicator below has three states rather than four - there is no
"storing is unavailable" state to show, because there is no editor to show it in.

### Seeding the demo is scaffolding, and its deletion needs two things

The doc is clear that "load the demo" should be a URL import of the demo published in `dist/`, not a
special case that writes files directly. That is tranche 3, and an empty library cannot wait for it.

So step 3 writes the demo into the store from `demoManifestYaml` and `demoYaml`, the `?raw` constants
`src/demoStory.ts` already exports - and carries a comment naming its deletion condition, the way
that module's own header already does ("once the player parses manifest.yaml at boot [...] this
module has no reason to exist").

**That condition is the picker *and* URL import, not either one**, because the seed is doing two
jobs:

- **Keeping the editor alive.** With no picker, an empty library is not a blank page, it is a hard
  failure - there is nothing to open. The picker's "new project" retires this half, since an author
  can mint one (ticket 04's `createProject` with no files is already that call).
- **Making first-run good.** That is the demo specifically. The design doc is blunt that an empty
  picker is the worst possible introduction to an authoring tool. Only URL import retires this half.

Delete the seed after the picker alone and a new author's first experience becomes an empty project
instead of a story, which is worse than today. So the seed survives tranche 2 and dies in tranche 3.
`.scratch/project-storage/spec.md`'s cross-edge note says the same thing from the other direction.

## 3. Storing

**`VnEditor` has no change hook today.** It listens for `blur`, `gutterClick` and
`scrollCursorIntoView`, and reparses on blur; nothing fires per keystroke. So this adds a
`vnEditor.on("change")` handler, and there are three traps in it:

- **`setValue` fires `change`.** `loadProject` sets both buffers, so an unguarded handler writes back
  everything it just read on every boot. Guard it - a flag around the load, or by not arming the
  handler until the load resolves.
- **The handler must know which buffer changed.** One CodeMirror instance holds both docs; the change
  event carries the doc, and `activeBuffer` says which is on screen. Use the doc, not the active tab:
  they agree today but the tab is UI state and the doc is the thing that changed.
- **Debounce, and let the last write win.** Ticket 03's per-path write serialization is what makes
  that safe; without it a fast typist can have two writes to `script.yaml` in flight.

**Store the buffer, not the parse.** A manifest that does not parse is still the author's work and
still gets written to disk. Reloading gives them their broken manifest back with the gutter marked,
which is exactly what ADR 0002 already does in-session. Gating the write on a successful parse would
mean the one edit an author most wants back after a crash is the one that was not written.

**Store to the directory, never to the manifest's id.** An author who edits `id:` in the buffer has
made the directory and the manifest disagree, and that is precisely the state ticket 04's
`ProjectSummary` reports and tranche 2's rename resolves. Do not re-derive a path from the id here,
and do not rewrite the id to match the directory - the doc calls that out as the wrong direction and
the cheap-looking one.

### Interval and flushes

**2000ms after the last keystroke**, plus a flush on blur, plus a best-effort flush on
`visibilitychange` when `document.visibilityState === "hidden"`, with `pagehide` as a backstop.

Not `unload`: it suppresses bfcache, Chrome is deprecating it, and mobile browsers routinely kill a
backgrounded tab without ever firing it. `pagehide` is strictly better and fires on bfcache entry
too, but `visibilitychange` to hidden is the signal that actually catches a mobile app-switch, which
is the last moment before a background kill.

**The debounce is the guarantee; every flush is a bonus.** No unload-time hook can promise that an
async OPFS write completes - `sendBeacon` is the only mechanism with a delivery guarantee and it is
network-only, so it is no help here. Write that down, because the tempting later change is to
lengthen the interval on the theory that the unload flush covers it, and it does not.

## 4. The storing indicator

Three states: **stored**, **unstored**, **failed**. No transient "storing..." - a local OPFS write is
milliseconds and it would only flicker; unstored goes straight to stored. `failed` earns its place
because quota exhaustion is a real outcome and silently staying dirty forever is the worst version of
it.

**Per project, not per buffer.** Both buffers go to one store and an author thinks "is my project
stored", not "is my manifest stored". So: unstored if *either* buffer has unwritten changes.

**Placement: above the right corner of the editor buffer** - right-aligned in the tab bar row inside
`#vn-editor`, so it travels with the editor rather than being page chrome. It must not read as a
third tab: the tabs carry per-buffer error status and this is per-project, so keep it visually
distinct and pushed to the far edge (`margin-left: auto` in `.vn-editor-tabs`).

**Ownership splits the way the rest of this does.** `VnEditor` owns the element and exposes
`setStoreState(state)`; the entry point calls it after each write resolves or rejects. Storage stays
out of `src/editor/`, the pixel stays in the tab bar, and neither has to import the other - the same
division as the fullscreen button and the export-URL button.

The `failed` state is also the only place a quota error surfaces in tranche 1. A dialog would be
over-engineering here; a console error beside the indicator is enough.

## The player entry point does not change

`src/playerIndex.ts` keeps the relative-path resolver, keeps `?vn=`, and never touches OPFS. The
doc's "the player and the editor get different resolvers" is the steady state, and a reader following
a link wants a first frame rather than an import.

## Tests

`test/browser/`, over ticket 03's scratch directory.

- **the round trip**: write a project into the store, boot the editor over it, and assert the story
  that mounts is the stored one
- **storing**: type into the script buffer, wait past the debounce, read `script.yaml` back and
  assert it holds what was typed
- **a manifest that does not parse is still stored**, and reading it back gives the broken text
- **a boot with an empty library** ends with the demo in the store and playable
- **the indicator** goes unstored on a keystroke and stored once the write resolves
- **the resolver**: a story whose background comes out of OPFS renders it, with nothing served over
  HTTP for that path. This is the one that proves the seam end to end.

`startEditor` in `test/helpers/vnHarness.ts` mounts player, renderer and editor over one root and is
the obvious base; it will need an option for a resolver and a store-backed boot, added narrowly
rather than by rewriting it - the existing callers should not have to care.

Run `npm run test:demo` too. The demo boots through the editor in this entry point, and a boot
sequence is exactly the kind of change the fast gate will not tell you about.

## Not in scope

- **Two tabs.** Storing is what `navigator.locks` protects, and until it lands two editor tabs on one
  project overwrite each other. That is **ticket 06, immediately after this one** - it was in tranche
  2 until it became clear this ticket is what creates the hazard. Do not ship 05 and stop.
- **Switching projects.** One project is open, named by `editor.yaml`. Switching is the picker's, and
  is a full teardown and remount rather than a live swap.
- **`persist()`.** Belongs with the library UI's size and export nag, which is where an author would
  see the result.
