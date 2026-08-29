# Editing manifest.yaml in the editor

Status: ready-for-agent

The editor can author a script but not a project. `manifest.yaml` became a real document in
[#35](https://github.com/a544jh/WebVn/pull/35) and a symbol table in
[#36](https://github.com/a544jh/WebVn/pull/36) - it now decides the cast, every asset id, and the
project's identity - and there is still no way to change it without editing a file in the repo and
rebuilding. Filed 2026-08-28 from a shape sketched by the author; refined 2026-08-29, which settled
the frontier and grew the ticket by one thing nobody had noticed - the asset loaders cannot report a
file that is not there, and apply-on-blur is the first caller that has to survive one.

## The shape, as sketched

- A **second CodeMirror instance** for the manifest, beside the existing one for the script.
- **Tabs above the editor** switch between them. Crude CSS, no styling work: showing and hiding the
  two instances is all the tabs do.
- The manifest **applies on editor blur**, not on every keystroke.
- **Error handling as already documented** - `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md`.

## Why blur, and why that is not the script's blur

The script reparses constantly because a half-written script is still a story: `parseStory` always
returns a playable state. A half-written manifest is not a project. `parseManifest` returns
`[VnManifest | null, ParserError[]]`, so reparsing every keystroke would spend most of an edit with
no manifest at all, and the preview has to be seeded from *something*.

ADR 0002 already decided what happens, and named this ticket while doing it:

> When manifest editing reaches the editor, it cannot show a half-applied manifest the way it shows a
> half-parsed script. It has to render the errors and keep the last valid manifest, which is a
> different interaction from the script buffer's and should not be assumed to fall out of the
> existing one.

So: **on blur, parse; on success, swap in the new manifest and reload; on failure, mark the gutter and
keep the last valid one.** The editor holds the last valid manifest as state - which it already does,
just immutably (`private manifest: VnManifest`, set once in the constructor and never reassigned).

Note the ADR's last consequence: `ParserError` and `SourceLocation` are the currency for both parsers,
so the existing gutter machinery (`setErrorMarker`) works unchanged on manifest errors. The failure
modes differ; the reporting does not.

## What applying a manifest has to do

More than swapping the field. `parseDocument()` passes `this.manifest` into `parseStory`, so a new
manifest means:

1. **Reparse the script against it.** Actor ids and asset ids are resolved through the manifest, so
   the same script produces different errors under a different manifest - which is the point: fixing a
   typo'd asset id in the manifest should clear the error in the script.
2. **Reload assets.** `renderer.loadAssets(state)` walks the declarations. A newly declared or
   renamed file is not in the loader until this runs, and `DomRenderer`'s sub-renderers throw on an
   asset that resolves to a path nothing preloaded.
3. **Reseed and reload the story.** `seedState(manifest)` is what turns a manifest into a starting
   state, and the starting state is what a `VnPath` replays from.

In order, and with the await where `loadScript` already puts it:

```
parseManifest(text) -> null? mark the gutter, keep the last valid manifest, stop
                    -> ok?   this.manifest = manifest
                             state = parseDocument()            // reparses the script, remarks its gutter
                             await renderer.loadAssets(state)   // before anything renders
                             player.reloadStory(state)
                             renderer.render(false)
```

**The reparse must not be gated on the script buffer being dirty.** `goToLine` skips `parseDocument`
when the script doc `isClean()`, which is right when only the playhead moved and wrong here: the
script is untouched and its meaning changed anyway. An apply that reuses `goToLine` wholesale
silently does nothing on the common case.

## Decisions taken in refinement

### 1. Applying reloads, and keeps the path as far as it replays

`player.reloadStory(state)` - the call `goToLine` already makes after a script edit. It is not a
weaker answer than dropping the path, it is the same answer the script buffer gives, and the
machinery underneath is honest about the reseed:

- `reloadStory` sets `startingState` to the new state, so every later replay (undo, a replay jump,
  loading a save) starts from the new beginning rather than the old one.
- `replayAsFarAsPossible` walks the recorded actions against that new beginning and **stops at the
  first one that no longer applies**, returning the truncated path. Nothing is replayed against a
  state it does not fit; the path is cut back to the part that still describes where the player is.
- `seenCommands` is carried over by hand (`state.seenCommands = this.state.seenCommands`), because
  every seed mints its own set. Read text stays read across a manifest edit, as it does across a
  script edit.

So the "keep it and accept that it may not replay" option turned out not to exist: the path cannot
mis-replay, it can only be shortened. The third option - keep it only when the reseed is provably
compatible - is exactly what `replayAsFarAsPossible` approximates, and the cheap approximation is the
one that already ships.

### 2. `id` is editable, and saves become `vn-save-<id>`

The TODO in `index.ts` (`// TODO: id from VN title`) predates the manifest having an `id`; the field
it was waiting for now exists, so this ticket spends it. Three call sites hardcode `"test"`:

- `src/index.ts:19` - `loadFromLocalStorage("test")`
- `src/playerIndex.ts:16` - the same, and it already has `demoManifest` in scope
- `src/domRenderer/DomRenderer.ts:287` - `persistGlobalSave`, with its own `// TODO get id from vn "title" ?`

The writer is the awkward one. `DomRenderer` has the player, and **`VnPlayerState` deliberately does
not carry `id`** - `seedState` copies the declarations and drops identity, which is
`docs/adr/0001-manifest-seeds-the-initial-state.md`'s amendment. Do not put `id` into the state to
solve this. Give `DomRenderer` the save id as its own field, set from the manifest at construction and
updated when the editor applies a new one. That is the same shape as the editor's `manifest` field
becoming mutable, for the same reason.

What an in-session id edit does, precisely: **later writes go to the new key.** The slots already in
memory stay in memory and land under the new key on the next save; nothing re-reads the old key, and
nothing migrates. That is a project rename by the crudest definition, and it is the honest one until
`PROJECT_STORAGE.md`'s library exists - at which point renaming is a library operation and this
becomes a special case of it.

**The key becomes `vn-save-<id>` in the same change.** `save.ts` writes `vn-<id>`;
`PROJECT_STORAGE.md` specifies `vn-save-<id>` and says why: localStorage is origin-wide and shared
with the editor's own keys, so once ids are author-chosen a project named `settings` or `theme`
collides with whatever the app stores under that name. The prefix is the only thing separating the
author-controlled keyspace from the app-controlled one, and the two-level shape leaves `vn-editor-*`
free. That doc also dates the deadline: *"reshaping it is free now, when the only key in existence is
the demo's `vn-test`, and will not be later."* This ticket is what makes it later - the moment ids
are author-chosen, real project keys start existing - so the rename happens here or it happens
expensively.

Doing both at once also costs less than doing them apart: **one break, not two.** The demo's saves
move from `vn-test` straight to `vn-save-webvn-demo`, and anything saved before this lands is
unreachable. Acceptable: the only saves that exist are the demo's, on the machines of people who can
clear a localStorage key.

**It does not close the stale-save rough edge.** `ROUGH_EDGES.md` blames the hardcoded `"test"` for
saves surviving a script edit. The rekey fixes one half of that - two different stories no longer
share one key, which is the collision `PROJECT_STORAGE.md` has the standalone player hitting on
shared links - but not the other: the id names the project, not the version of its script, so a save
made before an edit still loads afterwards and `loadFromSlot` can still throw uncaught into
`SaveLoadMenu`. That entry stays open.

### 3. A declared file that is not there must not hang the apply

Found while reading, and the reason this ticket is not purely an editor change. `loadAssets` is
awaited before the reload, and neither loader can report a missing file:

- **`AudioAssetLoaderSrc.loadAsset` never settles on a 404.** It resolves from a `canplaythrough`
  listener and registers no `error` listener, so a declaration pointing at a file that does not exist
  leaves a promise pending forever. `Promise.all` never resolves, the apply never reaches
  `reloadStory`, and **nothing tells the author anything**: the manifest parsed clean, so there is no
  error marker either. The editor just quietly stops applying manifests.
- **`ImageAssetLoaderSrc.loadAsset` rejects.** `img.decode()` rejects on a failed load, so
  `Promise.all` rejects and the apply is lost as an unhandled rejection - louder, but no more visible
  to the author.
- **Registration is cumulative and never cleared.** `registerAsset` writes into a record that is only
  ever added to, and `loadAll` re-walks every path it has ever seen. So one typo'd filename does not
  just break its own apply, it breaks **every later apply in the session**, including the one that
  fixes the typo. Renaming a declaration also leaves the old path registered - harmless for
  rendering, since resolution goes by path, but it is why the typo persists.

This is not an exotic case: declaring a file before the art exists is the normal authoring order,
which is the same argument `.scratch/asset-manifest/issues/03-undeclared-assets-are-parse-errors.md`
makes about undeclared assets. The fix belongs in the loaders:

- Add an `error` listener to the audio loader so a failed load settles instead of hanging.
- Have `loadAll` resolve with what failed rather than rejecting, so the caller can decide. The apply
  should proceed - a missing background is a wrong frame, not a reason to refuse a manifest - and
  report the failed paths.
- A failed path must not stay registered as pending in a way that re-fails every subsequent `loadAll`.
  Either drop it or record the failure so it is not retried on every apply.

Where the report surfaces is an interface question, not a mechanism one: the console is enough to
start with, since these are filenames and not source locations, and there is no line to mark.

### 4. The tab bar gets an error state

Question was whether an invalid manifest blocks anything besides itself. It does not - the last valid
manifest keeps the preview alive and the script buffer keeps working - and that is exactly why it needs
saying: the author is looking at a preview built from a manifest that is not the one on screen, and the
only sign of that is a gutter marker in a tab they are not looking at. A class on the manifest tab when
its last parse failed, cleared when one succeeds, is about three lines and answers it. No new concept:
same information the gutter already has, in the one place that is visible from the other tab.

### 5. There is a test, and it is the first one `VnEditor` has ever had

Apply-on-blur and keep-the-last-valid-manifest are behavioural rather than DOM-shaped, so the test
survives the CM6 migration that deletes the tab bar - which makes this the cheapest place to start
`TODO` item `T` ("nothing mounts `VnEditor`; every editor change is verified by hand"). Browser
project, since CodeMirror needs a document.

What is worth asserting, in rough order of value:

- A valid manifest edit, on blur, changes what the script parses to - an id that was an error under
  the old manifest is not one under the new.
- An invalid manifest edit, on blur, leaves the preview on the last valid manifest and marks the
  error gutter.
- A second valid edit after an invalid one applies normally - the last-valid state is not sticky.
- The script buffer being clean does not stop the reparse (the `isClean` trap above).

Assert on player and renderer state, not on CodeMirror internals. The tab bar itself stays
hand-verified; it is the part being thrown away.

## Two things that break, found while reading

**`makeMarker` queries the document, not its own editor.**

```ts
const height = document.querySelector(".CodeMirror-linenumber")?.clientHeight + "px"
```

Already flagged as a hack by its own comment. With one instance it happens to be right. With two it
returns whichever comes first in the DOM, and if that one is the hidden tab, `clientHeight` is `0` and
every gutter marker in the visible editor gets `height: 0px`. Scope the query to the instance's own
root before adding the second editor, or the tabs ship with invisible error markers.

**CodeMirror 5 mis-measures in a hidden container.** An instance constructed inside `display: none`
has no line height to measure, and one revealed by a class change does not re-measure on its own -
`.refresh()` on tab switch is the documented remedy. This is exactly the "crude CSS" plan's one sharp
edge, and it is why the tabs need a switch handler rather than pure CSS.

## Implementation notes

- **`demoStory.ts` does not export the manifest text.** It imports
  `demoManifestYaml from "../test-assets/manifest.yaml?raw"`, parses it, and exports only the parsed
  `demoManifest` and the raw `demoYaml`. The manifest buffer needs the raw text, so export it
  alongside - a one-line change, and the symmetry `demoYaml` already has.
- **`VnEditor`'s constructor takes the manifest.** Making it a mutable field with a setter is the
  smallest change; whether the second CodeMirror belongs inside `VnEditor` or beside it is an
  interface question, not a mechanism one.
- **The render callback is bound to the script instance.** `onRenderCallbacks` sets the position
  marker and moves the cursor on `this.vnEditor`; with two instances those have to keep pointing at
  the script one rather than at whichever is visible.
- **`index.ts` seeds the player from `demoManifest`** before constructing the editor, and calls
  `editor.loadScript(demoYaml)` to boot. A manifest buffer means that boot loads two documents.
- The script buffer already has a `blur` handler (it re-syncs the position marker), so blur is an
  established event here, not a new concept.

## Mostly disposable, like find-in-file - but less of it than it looks

`design-docs/EDITOR.md` migrates to CodeMirror 6, and its model is one `EditorState` per file swapped
with `view.setState()` - which is *also* what script includes need, and which `TODO` carries as
"editor multi-buffer, file switcher, per-buffer markers" under the CM6 migration.

Read that `TODO` line carefully before calling this throwaway: **CM6 supplies the buffer model, not a
UI for choosing between buffers.** It is a library of editor extensions and ships no tab bar or file
switcher, which is why the switcher is listed there as work rather than as something the migration
brings. So the migration deletes less of this than a first look suggests:

- **Deleted:** the second `CodeMirror()` instance and the `display: none` show/hide, and the
  `.refresh()` on switch with it - one view swapping states never constructs a hidden instance to
  mis-measure.
- **Survives, and grows:** the tab bar's markup and its switch handler. A two-tab toggle is the
  ancestor of the file switcher that multi-buffer needs anyway, with the manifest as one buffer among
  N rather than one of two.
- **Untouched:** apply-on-blur, the keep-the-last-valid-manifest rule, the save rekey and the loader
  fix. None of those are about CodeMirror.

That is still an argument for keeping it crude, and now also an argument that crude is cheap:

- The manifest is unauthorable **today**, and the CM6 migration is an `L` behind item `T`.
- `TODO` already makes the same call for item `A` (find-in-file): *"Disposable - the CM6 migration
  deletes it - and there is no reason for it to wait behind anything."* This ticket is the weaker
  version of that claim, not the same one.
- The genuinely thrown-away part is two instances and a show/hide. That is small enough not to argue
  about, and the switcher it hangs off is a down payment on multi-buffer rather than a write-off.

So: build it now, expect the second instance to die at the migration and the tab bar to be rewritten
into the file switcher rather than deleted. Keep the markup dumb enough that turning two tabs into a
list of files is not a fight, but do not build the file switcher here - two hardcoded tabs is the
right size for a two-buffer editor.

## Not in scope

- **The CodeMirror 6 migration**, and multi-buffer proper. `design-docs/EDITOR.md`.
- **Autocompleting asset ids from the manifest.** `EDITOR.md`'s completion table wants exactly this,
  and it needs item `B` and the syntax tree first.
- **Where the manifest text is stored.** Today it is a `?raw` import of a file in the repo; the OPFS
  project store is what makes it editable-and-saved. `design-docs/PROJECT_STORAGE.md`.
- **A project rename flow, and migrating saves across an id change.** The id becomes the save key
  here; moving existing saves to a new key, or listing projects, is `PROJECT_STORAGE.md`'s library -
  which decides that a rename orphans the old key deliberately, so there is nothing to migrate anyway.
- **Catching an incompatible save on load.** The `SaveLoadMenu` half of the `ROUGH_EDGES.md` entry
  above, which this ticket narrows but does not close.
- **Adding or uploading asset files.** This edits declarations, not the assets they point at. A
  declared file that does not exist stays a load failure - this ticket only makes it a survivable and
  reported one.
- **Refusing to parse a script that names an undeclared asset.**
  `.scratch/asset-manifest/issues/03-undeclared-assets-are-parse-errors.md` is that rule, and it is
  independent of where the manifest is edited.

## See also

- `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` - the error-handling rule, and the
  consequence that named this ticket
- `docs/adr/0001-manifest-seeds-the-initial-state.md` - why `id` is not in `VnPlayerState`, which is
  what makes the save rekey a threading problem rather than a lookup
- `design-docs/EDITOR.md` - the CM6 migration and multi-buffer this duplicates and is deleted by
- `design-docs/PROJECT_STORAGE.md` - where the manifest text eventually lives, and the `vn-save-<id>`
  key this adopts
- `ROUGH_EDGES.md` - the stale-save entry this narrows to its remaining half
- `.scratch/asset-manifest/issues/03-undeclared-assets-are-parse-errors.md` - the other half of
  "declared before it exists is the normal authoring order"
- `TODO` - item `A` for the disposable-feature precedent, item `T` for the missing editor tests
- `src/editor/editor.ts`, `src/index.ts`, `src/playerIndex.ts`, `src/demoStory.ts`,
  `src/core/player.ts` (`reloadStory`), `src/core/save.ts`, `src/assetLoaders/`,
  `src/yamlParser/parseManifest.ts`
