# The editor boots from the store, and saves into it

Status: ready-for-agent

The ticket an author would notice: what they type survives a reload. Needs 01, 03 and 04. Three
pieces - the OPFS resolver that ticket 01 left unwritten, a boot path that reads a project instead of
importing one, and autosave.

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

1. `isSupported()`. If not, fall back to exactly today's behaviour - the demo from the compiled-in
   constants, no autosave - plus a visible note that projects cannot be saved in this browser. A
   browser without OPFS should get a working demo, not a dead page.
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

### Seeding the demo is scaffolding, and says so

The doc is clear that "load the demo" should be a URL import of the demo published in `dist/`, not a
special case that writes files directly. That is tranche 3, and an empty library cannot wait for it.

So step 3 writes the demo into the store from `demoManifestYaml` and `demoYaml`, the `?raw` constants
`src/demoStory.ts` already exports - and carries a comment naming its deletion condition, the way
that module's own header already does ("once the player parses manifest.yaml at boot [...] this
module has no reason to exist"). When URL import lands, this becomes a call to it and the demo stops
being a special case for good.

## 3. Autosave

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

**Save the buffer, not the parse.** A manifest that does not parse is still the author's work and
still gets written to disk. Reloading gives them their broken manifest back with the gutter marked,
which is exactly what ADR 0002 already does in-session. Gating the write on a successful parse would
mean the one edit an author most wants back after a crash is the one that was not saved.

**Autosave writes to the directory, never to the manifest's id.** An author who edits `id:` in the
buffer has made the directory and the manifest disagree, and that is precisely the state ticket 04's
`ProjectSummary` reports and tranche 2's rename resolves. Do not re-derive a path from the id here,
and do not rewrite the id to match the directory - the doc calls that out as the wrong direction and
the cheap-looking one.

## The player entry point does not change

`src/playerIndex.ts` keeps the relative-path resolver, keeps `?vn=`, and never touches OPFS. The
doc's "the player and the editor get different resolvers" is the steady state, and a reader following
a link wants a first frame rather than an import.

## Tests

`test/browser/`, over ticket 03's scratch directory.

- **the round trip**: write a project into the store, boot the editor over it, and assert the story
  that mounts is the stored one
- **autosave**: type into the script buffer, wait past the debounce, read `script.yaml` back and
  assert it holds what was typed
- **a manifest that does not parse is still saved**, and reading it back gives the broken text
- **a boot with an empty library** ends with the demo in the store and playable
- **the resolver**: a story whose background comes out of OPFS renders it, with nothing served over
  HTTP for that path. This is the one that proves the seam end to end.

`startEditor` in `test/helpers/vnHarness.ts` mounts player, renderer and editor over one root and is
the obvious base; it will need an option for a resolver and a store-backed boot, added narrowly
rather than by rewriting it - the existing callers should not have to care.

Run `npm run test:demo` too. The demo boots through the editor in this entry point, and a boot
sequence is exactly the kind of change the fast gate will not tell you about.

## Not in scope

- **Two tabs.** The autosave this adds is the thing `navigator.locks` protects; that ticket is
  tranche 2's first, and until it lands two editor tabs on one project will fight. Worth a line in
  `ROUGH_EDGES.md` when this lands rather than silence.
- **Switching projects.** One project is open, named by `editor.yaml`. Switching is the picker's, and
  is a full teardown and remount rather than a live swap.
- **`persist()`.** Belongs with the library UI's size and export nag, which is where an author would
  see the result.
