# Editing manifest.yaml in the editor

Status: done

The editor can author a script but not a project. `manifest.yaml` became a real document in
[#35](https://github.com/a544jh/WebVn/pull/35) and a symbol table in
[#36](https://github.com/a544jh/WebVn/pull/36) - it now decides the cast, every asset id, and the
project's identity - and there is still no way to change it without editing a file in the repo and
rebuilding. Filed 2026-08-28 from a shape sketched by the author; refined 2026-08-29, then grilled
the same day over five rounds, which is where most of what follows comes from. The refinement settled
the frontier and changed the mechanism under the sketched UI from two editor instances to one instance
with a `Doc` per buffer. The grilling grew the ticket twice: the asset loaders cannot report a file
that is not there, and adopt-on-blur is the first caller that has to survive one; and the `?vn=`
payload has to carry the manifest, because keying saves by `id` without it is the one thing `TODO`
says not to do.

## The shape, as sketched

- **One CodeMirror instance holding a `Doc` per buffer**, swapped with `swapDoc`. The sketch said a
  second instance beside the first; refinement changed the mechanism and kept the UI. See below.
- **Tabs above the editor** switch between them. Crude CSS, no styling work: a tab click swaps the
  doc and moves an active class, and that is all the tabs do.
- The manifest is **adopted on editor blur**, not on every keystroke - and only when the manifest buffer
  is actually dirty. See decision 6.
- **Error handling as already documented** - `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md`.
- The **`?vn=` payload carries the manifest** alongside the script, because a manifest the author can
  change is one a shared link has to carry. See decision 8.

## Why blur, and why that is not the script's blur

The script reparses constantly because a half-written script is still a story: `parseStory` always
returns a playable state. A half-written manifest is not a project. `parseManifest` returns
`[VnManifest | null, ParserError[]]`, so reparsing every keystroke would spend most of an edit with
no manifest at all, and the preview has to be seeded from *something*.

ADR 0002 already decided what happens, and named this ticket while doing it:

> When manifest editing reaches the editor, it cannot show a half-adopted manifest the way it shows a
> half-parsed script. It has to render the errors and keep the last valid manifest, which is a
> different interaction from the script buffer's and should not be assumed to fall out of the
> existing one.

So: **on blur, parse; on success, swap in the new manifest and reload; on failure, mark the gutter and
keep the last valid one.** The editor holds the last valid manifest as state - which it already does,
just immutably (`private manifest: VnManifest`, set once in the constructor and never reassigned).

Note the ADR's last consequence: `ParserError` and `SourceLocation` are the currency for both parsers,
so the existing gutter machinery (`setErrorMarker`) works unchanged on manifest errors. The failure
modes differ; the reporting does not.

## What adopting a manifest has to do

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
blur -> manifest doc isClean()? stop - nothing was edited (decision 6)
        generation = ++adoptGeneration                          (decision 7)
        parseManifest(text) -> null? mark the gutter and the tab, keep the last
                                     valid manifest, stop
                            -> ok?   this.manifest = manifest
                                     state = parseDocument()    // reparses the script, remarks its gutter
                                     await renderer.loadAssets(state)
                                     if (generation !== adoptGeneration) stop
                                     player.reloadStory(state)
                                     renderer.render(false)
```

**The reparse must not be gated on the script buffer being dirty.** `goToLine` skips `parseDocument`
when the script doc `isClean()`, which is right when only the playhead moved and wrong here: the
script is untouched and its meaning changed anyway. An adoption that reuses `goToLine` wholesale
silently does nothing on the common case.

## Decisions taken in refinement

### 1. Adopting reloads, and keeps the path as far as it replays

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
updated when the editor adopts a new one. That is the same shape as the editor's `manifest` field
becoming mutable, for the same reason.

**`PROJECT_STORAGE.md` already hangs the project rename off this exact event.** *"The rename is
triggered from the manifest, on editor blur. That is already when the script is reparsed, so the id
change is noticed on the same event rather than needing a new one: blur, see that `id` differs from
the directory name, show the dialog."* So the id edit this ticket allows is not an orphan awaiting a
rename flow - it is the seam that flow is designed to plug into. That doc also names blur's second
weakness, which decision 6 does not solve: it **never fires on a tab close**. Moot here, because
nothing persists yet and a tab close loses the buffers either way; not moot once OPFS makes the
buffers worth keeping.

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

The throw is worth knowing precisely, because the symptom is not what it sounds like.
`SaveLoadMenu.ts:75` calls `DomRenderer.loadFromSlot`, which calls `VnPlayer.loadFromSlot`, which
calls `State.fromShorthandPath`. That throws in two places: `state.ts:328`, where `makeDecision`
returns the *same state object* when the recorded id matches no option, so identity is the detector;
and `state.ts:323`, where a replay that never reaches a decision at all gives up after 10000 advances.
Neither is caught, and the `SaveLoadMenu` click handler is a bare listener, so `renderer.closeMenu()`
on the next line never runs. The player clicks Load, confirms, and the menu sits there. **It is a dead
button, not a crash screen** - which is why nobody has reported it.

Accepted for now, per the grilling: the `id` names the project rather than the version of its script,
and an author who needs a clean slate can append a version to the `id`, since the `id` *is* the save
key. That is a crude lever but a real one, and it is why payload versioning is not needed yet.

### 3. A declared file that is not there must not hang the adoption

Found while reading, and the reason this ticket is not purely an editor change. `loadAssets` is
awaited before the reload, and neither loader can report a missing file:

- **`AudioAssetLoaderSrc.loadAsset` never settles on a 404.** It resolves from a `canplaythrough`
  listener and registers no `error` listener, so a declaration pointing at a file that does not exist
  leaves a promise pending forever. `Promise.all` never resolves, the adoption never reaches
  `reloadStory`, and **nothing tells the author anything**: the manifest parsed clean, so there is no
  error marker either. The editor just quietly stops adopting manifests.
- **`ImageAssetLoaderSrc.loadAsset` rejects.** `img.decode()` rejects on a failed load, so
  `Promise.all` rejects and the adoption is lost as an unhandled rejection - louder, but no more visible
  to the author.
- **Registration is cumulative and never cleared.** `registerAsset` writes into a record that is only
  ever added to, and `loadAll` re-walks every path it has ever seen. So one typo'd filename does not
  just break its own adoption, it breaks **every later adoption in the session**, including the one that
  fixes the typo. Renaming a declaration also leaves the old path registered - harmless for
  rendering, since resolution goes by path, but it is why the typo persists.

This is not an exotic case: declaring a file before the art exists is the normal authoring order,
which is the same argument `.scratch/asset-manifest/issues/03-undeclared-assets-are-parse-errors.md`
makes about undeclared assets. The fix belongs in the loaders:

- Add an `error` listener to the audio loader so a failed load settles instead of hanging.
- Have `loadAll` resolve with what failed rather than rejecting, so the caller can decide.
- A failed path must not stay registered as pending in a way that re-fails every subsequent `loadAll`.
  Either drop it or record the failure so it is not retried on every adoption.

**The adoption proceeds, and the failures are reported.** Refusing it would make the editor
unusable in the normal authoring order - declare the asset, then draw it - so a manifest that
references files which do not exist yet is still adopted. The report goes to the console *and* to the
tab, per decision 4.

**What "proceeds" does not mean.** An earlier draft of this ticket said a missing background is a
wrong frame rather than a reason to refuse a manifest. That is false, and the correction matters
because it sets this ticket's boundary. A failed preload leaves `assets[path]` at `null`, and the
sub-renderers throw on null rather than degrading:

- `BackgroundRenderer.ts:131` - `if (!image) throw new Error("Could not load " + state.image)`
- `SpriteRenderer.ts:142` - `if (!elem) throw new Error("Can't render unloaded sprite")`
- `AudioRenderer.ts:20,31` - `if (!newAudio) throw new Error("Could not play audio " + ...)`

So a declared file that nothing displays is silent forever, and one the story *reaches* throws
mid-render, on the frame that command paints. This ticket makes the failure reportable at adoption time;
it does not make the renderers survive it. Doing that means deciding what a missing sprite looks like
on screen, which is a renderer change with its own blast radius and its own ticket.

### 4. The tab bar gets an error state, for parse failures and load failures alike

Question was whether an invalid manifest blocks anything besides itself. It does not - the last valid
manifest keeps the preview alive and the script buffer keeps working - and that is exactly why it needs
saying: the author is looking at a preview built from a manifest that is not the one on screen, and the
only sign of that is a gutter marker in a tab they are not looking at. A class on the manifest tab when
its last parse failed, cleared when one succeeds, is about three lines and answers it. No new concept:
same information the gutter already has, in the one place that is visible from the other tab.

**This was already designed, in another document.** `design-docs/SCRIPT_INCLUDES.md` lists what
multi-buffer needs and includes *"markers filtered to the open buffer, plus some indicator that a
different file has errors, since otherwise a broken script looks clean"*. Same requirement, arrived
at from includes rather than from the manifest, which is a good sign it is the right one.

**A failed asset load marks it too.** The two states are not identical - a parse failure means the
preview is built from a *different* manifest than the buffer shows, while a load failure means the
preview is the buffer's manifest with a file missing under it - and one reading of that says the badge
should mean staleness only, with load failures going to the console. Rejected: a filename typo is
otherwise invisible until the story reaches the asset and throws, which is the worst possible moment
and the furthest from the edit that caused it. The badge means "this buffer is not fully in effect",
which covers both, and the gutter and console still distinguish them for anyone who looks.

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
- A second valid edit after an invalid one is adopted normally - the last-valid state is not sticky.
- The script buffer being clean does not stop the reparse (the `isClean` trap above).

**The harness does not exist yet, and building it is half the value.** `test/helpers/vnHarness.ts`'s
`startVn` mounts a `DomRenderer` into a fresh root; nothing anywhere mounts a `VnEditor`, which is
precisely why item `T` exists. Add a `startEditor` beside it that mounts player, renderer and editor
over one root, seeded from `TEST_MANIFEST` so the test declares only the two or three assets it needs.
That helper, not the test, is what retires "every editor change is verified by hand".

**The payload gets its own tests, in a file that already exists.**
`test/browser/scriptUrl.test.ts` has five round-trip and URL-shape tests, and decision 8 changes the
contract they encode. Extend it: round-trip a manifest and a script together, assert the manifest is
the first document, and assert a legacy single-document payload is rejected. It stays in `browser`
because `CompressionStream` is why it was put there.

Assert on player and renderer state, not on CodeMirror internals. The tab bar itself stays
hand-verified; it is the part being thrown away.

### 6. Blur adopts only when the manifest buffer is dirty

Blur is a much broader event than "I finished editing the manifest": clicking the preview, the
Fullscreen button, a jump-mode radio, or another browser tab all fire it. Unguarded, each one would
reparse, reload assets, reload the story and re-render - so clicking into the preview to test
something would reload the story out from under the author.

**One rule to reconcile.** `SCRIPT_INCLUDES.md` says multi-buffer wants *"'clean' redefined as all
buffers clean"*. That is about a save-state notion across N script files, and it does not conflict
with what follows - but the two dirty flags here are used for opposite purposes, so an implementer
holding both documents needs it said: the manifest buffer's own dirtiness gates its adoption, the
script buffer's cleanliness must never gate the reparse, and an all-buffers-clean rule is a third
thing again, for whoever adds the third buffer.

Gate the adoption on the manifest doc's own `isClean()`. It kills every spurious case in one line, keeps
the sketched interaction, and reuses a gate this file already has - `goToLine` does the same thing for
the script. Note it is the *opposite* gate from the trap above: the manifest's dirtiness gates the
adoption; the script's cleanliness must not gate the reparse.

### 7. Overlapping adoptions need a generation guard

The adoption is asynchronous - `await renderer.loadAssets(state)` sits between parsing and reloading -
so two blurs in quick succession, or an adoption racing a script reload, can resolve out of order and let
an older manifest win. `DomRenderer` already carries `renderGeneration` for exactly this hazard, and
`CLAUDE.md` documents at length both how it works and that the fast gate cannot see it. The editor's
adoption has no equivalent.

Bump a counter at the top of the adoption, capture it, and bail after the await if it has moved. Four
lines, and it mirrors a pattern this codebase has already committed to rather than inventing one.

### 8. The `?vn=` payload becomes two documents: manifest, then script

Not scope creep - the thing that makes decision 2 legal. `TODO`'s ordering edges say it outright:

> Two-document URL payload before player save keying. `?vn=` carries a script alone and is parsed
> against the demo's manifest, so once saves are keyed by id the only id in scope is webvn-demo and
> every shared story saves on top of every other one. Harmless only while the key is the hardcoded
> "test" everyone shares.

Keying saves by `id` while the payload carries no manifest would *claim* per-project saves and not
deliver them, which is worse than today's uniformly-shared key. So the payload carries the manifest,
and the two land together.

The format is a two-document YAML stream, **manifest first, then the script**. Cheaper than `TODO`'s
`M` suggests, because the seam exists: `composeDocuments` already returns every document with one
shared `LineCounter`, and its comment says why - *"a stray `---` is a thing a caller may want to
refuse rather than silently drop."* Line numbers across the split come out right for free. What is
missing is that both parsers take `docs[0]` and drop the rest, which decision 10 fixes.

**A single-document payload is invalid, and every link shared before this breaks.** Accepting a bare
script for backwards compatibility would reintroduce exactly the collision above. The payload needs no
version field to tell old from new: one document is legacy, two is current, and the manifest inside
carries `formatVersion: 1` for anything finer. The only links in the wild are the author's own.

**The player says so.** `playerIndex.ts` ignores `parseStory`'s error list entirely and has no error
UI at all; this is the first time the player must speak to a *player* rather than an author. Render
one plain line into the vn div - "this story could not be loaded". A blank stage is indistinguishable
from a bug, and this is a dead end rather than a degraded render. One unstyled line; a real error
screen belongs to `PROJECT_STORAGE.md`.

**The two-document form is transport only.** Decode splits the stream and hands the manifest to
`parseManifest` and the script to `parseStory`; the editor's two buffers keep parsing as single
documents, so per-buffer gutters stay trivially correct.

**The demo boots through the same path.** With `?vn=` absent, `playerIndex.ts` falls back to the
demo - but as a source of `(manifestText, scriptText)`, not as a second code path. That makes
`demoStory.ts`'s own comment come true (*"the demo becomes an ordinary project loaded through the
normal path"*) and, more usefully, means every demo load exercises the payload path instead of leaving
it to shared links nobody clicks.

### 9. Export is refused while the manifest is invalid

`exportUrl()` validates nothing today - `playerUrl(await encodeScript(editor.getScript()))` - and that
is coherent for the script, because a script full of errors still plays. It is not coherent for the
manifest, because decision 8 makes the player bail on one that does not parse. A link that is
*guaranteed* to fail is not a degraded artifact, it is a dead one, and the author finds out when
somebody else clicks it.

Grey out Export while the manifest is invalid, following `canSave`'s precedent - the pause menu
already greys out Save when the path cannot be expressed as a save. The state is free: decision 4
already tracks whether the manifest last parsed.

The payload carries the **raw manifest buffer text**, not a re-serialisation of the parsed manifest.
The demo's manifest opens with a six-line comment block, and round-tripping through the parser eats
comments.

### 10. Both parsers refuse a multi-document input

`parseStory` and `parseManifest` both take `docs[0]` and silently drop the rest, so a stray `---`
pasted into either buffer discards everything after it with no message. `composeDocuments` anticipated
this and returns every document precisely so a caller can refuse. Make both parsers report a
`ParserError` when handed more than one document.

It is the same check decision 8's splitter needs to reject a legacy payload, written once - and the
silent-data-loss path gets much easier to hit the moment authors learn the payload format is built on
`---`.

## Order of work

Three separable landings in one ticket. The order matters because the first one silently breaks the
others if it comes last:

1. **The loader fix** (decision 3). Independent of everything else, and the adoption depends on it -
   an adoption built on loaders that hang is one that appears to work until the first typo.
2. **The editor: buffers, tabs, adoption, tab state, the `startEditor` harness and its tests**
   (decisions 1, 4, 5, 6, 7, 10, and the mechanism below).
3. **The payload, the save rekey and the export gate** (decisions 2, 8, 9). Last, because exporting a
   manifest needs a manifest buffer to export from.

## One instance, two `Doc`s - not two instances

The sketch's second instance was the first shape that came to mind, not a rejection of the
alternative. CodeMirror 5 already has multi-buffer: `cm.swapDoc(doc)`, one `CodeMirror.Doc` per file.

**And this was prescribed before the ticket existed.** `design-docs/SCRIPT_INCLUDES.md` says outright
what multi-file needs: *"one `CodeMirror.Doc` per file with `swapDoc` to switch between them, which
brings per-file undo history and cursor position along for free; a file switcher"*. The refinement
re-derived that from the CodeMirror source rather than reading it there first. It is a stronger
argument than the one the refinement found, because it makes this the two-buffer subset of a design
the repo has already committed to - not merely 5.x's ancestor of the CM6 model.
`design-docs/EDITOR.md`'s own migration table has the row - `swapDoc` maps to CM6's *"hold an
`EditorState` per file, `view.setState()`"* - so this is the 5.x spelling of the model the migration
adopts, and porting it is a call-site change rather than a deletion.

The UI is unchanged: a tab bar over one instance is the same markup and the same click handler. Only
what happens underneath the click changes.

**What it deletes.** Nothing is ever constructed inside `display: none`, which removes the sharpest
edge in the two-instance plan: CodeMirror 5 has no line height to measure in a hidden container and
does not re-measure when a class reveals it, so that plan needed a `.refresh()` on every tab switch
and would have kept needing one per buffer as includes add buffers.

**What it costs.** Two small branches - `blur` and `gutterClick` both have to ask which buffer is
active - and one type augmentation, below.

**Verified against the CodeMirror 5 source, because the typings say otherwise.** `@types/codemirror`
declares `setGutterMarker` and `clearGutter` only on `Editor`, at the pinned `0.0.109` and at the
current `5.60.18` alike. In `codemirror.js` both are defined inside `Doc.prototype`, wrapped in
`docMethodOp`, which opens:

```js
var cm = this.cm; if (!cm || cm.curOp) { return f.apply(this, arguments) }
```

That `!cm` branch is the detached-doc path. Marker data is stored on the line handle
(`line.gutterMarkers`) and lines belong to the `Doc`, so **a detached buffer can be marked and keeps
its markers across the swap**. They appear on `Editor` in the typings only because CM5 delegates every
`Doc.prototype` method onto the editor except `iter insert remove copy getEditor constructor`.

This is load-bearing for the adoption rather than incidental: adopting the manifest reparses the
*script* while the *manifest* buffer is the visible one, so the script's error gutter is remarked
while its doc is detached. It works; TypeScript will not believe it. Add
`src/types/codemirror.d.ts` declaring the two methods on `CodeMirror.Doc` - a global augmentation in
the pattern `src/types/screenOrientation.d.ts` already establishes and `CLAUDE.md` documents.

`Doc` also owns `getValue`, `setCursor`, `isClean`/`markClean` and the undo history, so per-buffer
undo, cursor and dirty-tracking come free - the same properties `EDITOR.md` credits CM6's model with.

## One thing that breaks, found while reading

**`makeMarker` queries the document, not its own editor.**

```ts
const height = document.querySelector(".CodeMirror-linenumber")?.clientHeight + "px"
```

Already flagged as a hack by its own comment, and with one instance it stays accidentally correct -
which is why one instance is the shape being built. It was a blocker under the two-instance plan
(the query would find the hidden tab's line number, measure `clientHeight` as `0`, and give every
marker in the visible editor `height: 0px`) and is merely a hack under this one. Scope it to the
instance's own root anyway while the file is open; `EDITOR.md` notes the CM6 gutter extension deletes
it outright.

## Implementation notes

- **`demoStory.ts` does not export the manifest text.** It imports
  `demoManifestYaml from "../test-assets/manifest.yaml?raw"`, parses it, and exports only the parsed
  `demoManifest` and the raw `demoYaml`. The manifest buffer needs the raw text, so export it
  alongside - a one-line change, and the symmetry `demoYaml` already has.
- **`VnEditor`'s constructor takes the manifest.** Making it a mutable field with a setter is the
  smallest change; whether the tab bar belongs inside `VnEditor` or beside it is an interface
  question, not a mechanism one.
- **The single-buffer audit is already written.** `SCRIPT_INCLUDES.md` enumerates the six places
  `VnEditor` assumes one document, with line numbers - `getScript`/`loadScript`, `parseDocument`,
  `isClean` and `goToLine`, the two marker setters, the render callback at `editor.ts:46`, and
  `goToLine`'s `findIndex` at `editor.ts:115`. Work from that list rather than rediscovering it. What
  follows is the same audit stated for two buffers rather than N.
- **Everything that means "the script" has to say so.** `parseDocument`, `goToLine`, the position
  marker and the render callback all reach through `this.vnEditor.getDoc()` today, which silently
  means "whatever is on screen" once a swap exists. They want the script `Doc` by name - the render
  callback especially, since a render while the manifest tab is up would otherwise move the
  manifest's cursor. Two instances would force the same audit; neither shape avoids it.
- **Marker helpers take a target.** `setErrorMarker`, `setPositionMarker` and the `clearGutter` calls
  hardcode `this.vnEditor`. They become functions of a `Doc`, which is also what lets the script's
  gutter be remarked while the manifest tab is visible.
- **`index.ts` seeds the player from `demoManifest`** before constructing the editor, and calls
  `editor.loadScript(demoYaml)` to boot. A manifest buffer means that boot loads two documents.
- The script buffer already has a `blur` handler (it re-syncs the position marker), so blur is an
  established event here, not a new concept.

## Not disposable, unlike find-in-file

`design-docs/EDITOR.md` migrates to CodeMirror 6, and its model is one `EditorState` per file swapped
with `view.setState()` - which is *also* what script includes need, and which `TODO` carries as
"editor multi-buffer, file switcher, per-buffer markers" under the CM6 migration.

The first pass of this ticket filed the work under `TODO` item `A`'s precedent - *"Disposable - the
CM6 migration deletes it - and there is no reason for it to wait behind anything."* That was wrong
twice over, and both corrections point the same way:

- **CM6 supplies the buffer model, not a UI for choosing between buffers.** It is a library of editor
  extensions and ships no tab bar or file switcher, which is why `TODO` lists the switcher as work
  rather than as something the migration brings. The tab bar survives the migration and grows into
  that switcher, with the manifest as one buffer among N rather than one of two.
- **`swapDoc` is the 5.x spelling of `view.setState()`**, per `EDITOR.md`'s own table. So the
  mechanism is ported at migration time, not deleted - the call site changes and the shape does not.

What is thrown away is a `swapDoc` call and two `Doc` constructions. Everything else - the tab bar,
adopt-on-blur, keep-the-last-valid-manifest, the save rekey, the loader fix - either survives or was
never about CodeMirror. Item `A` genuinely is deleted by the migration, since CM6 ships search as an
extension; this is not that, and should stop borrowing its argument.

It is still worth keeping crude. Two hardcoded tabs is the right size for a two-buffer editor, and
building the file switcher here would be building multi-buffer's UI before multi-buffer. Keep the
markup dumb enough that turning two tabs into a list of files is not a fight, and leave it there.

## Alternatives considered

Recorded so the mechanism is not relitigated. All were weighed at the 2026-08-29 refinement.

- **Two CodeMirror instances with show/hide** - the original sketch. Roughly the same amount of code
  as one instance and two `Doc`s, but it buys the hidden-container measurement problem and its
  `.refresh()` dance, makes the `makeMarker` scoping fix mandatory rather than optional, does not
  scale to includes (N buffers becomes N hidden instances), and is deleted rather than ported at the
  migration. The trade is a class of layout bugs in exchange for an eight-line type augmentation.
- **Both buffers visible, no tabs** - two panes, stacked or side by side. Genuinely the least code of
  any option: no tab bar, no switch handler, no `.refresh()`, no blur branching, and it would delete
  decision 4 outright, since a manifest that is on screen needs no tab error state. It also reads
  well for the actual workflow, where a typo'd asset id is an error in one buffer and a fix in the
  other. Rejected for screen space on an already-busy page, and because it is still two instances and
  so pays nothing toward includes.
- **A plain `<textarea>` for the manifest.** An hour's work and honestly disposable, but it spends
  exactly what ADR 0002 identified as the payoff: `ParserError` and `SourceLocation` are shared
  currency, so the gutter machinery works on manifest errors unchanged. A textarea has no gutter, and
  no YAML highlighting on a document that is nothing but nested YAML.
- **A form generated from the Zod schema.** Tempting, because a form cannot produce a syntactically
  invalid manifest and would delete adopt-on-blur and the keep-the-last-valid rule with it. Rejected:
  it round-trips YAML through a UI and loses comments - the demo's manifest opens with a six-line
  comment block - and `PROJECT_STORAGE.md` wants `manifest.yaml` as a real file in the archive. Worth
  naming, because if a form is ever the destination then the buffer is the throwaway and none of the
  above matters.
- **One document, with `manifest:` and `story:` as top-level keys.** Zero UI work. Rejected: it
  contradicts the two-file project layout, puts two schemas in one document against
  `formatVersion`-checked-first, and turns the two parsers' deliberate disagreement about failure
  into a single-document contradiction.

## This ticket and ticket 03, in plain words

`.scratch/asset-manifest/issues/03-undeclared-assets-are-parse-errors.md` also concerns assets and the
manifest, and the two are constantly mistaken for each other. The line between them:

**03 is a mistake you can catch by reading the two documents.** The script says `bg: forst` and the
manifest declares no `forst`. Both documents are in front of you, so the parser can see the mismatch
just by reading them. Today it sees nothing, and the story parses clean, plays, and blows up on the
frame that needs the image.

**This ticket is a mistake you can only catch by trying to load a file.** The manifest says the
`forest` background lives in `forst.png`, and no such file exists. 03's check passes, because the
script asked for something the manifest genuinely declares. Nothing is wrong on paper. It surfaces
only when something tries to fetch the file - and today that failure is invisible, which is what
decision 3 is about.

So they cover disjoint halves and neither makes the other unnecessary: a parser can catch the first
and can never catch the second, because it does not know what files exist.

Three places they touch:

- **A shared motive.** Authors declare things before the art exists, so both have to stay usable while
  half the assets are missing. That is the argument for 03's severity question and for this ticket's
  "the adoption proceeds".
- **03 gets more valuable once this lands.** Its pitch is "an error you can fix now", and until the
  manifest is editable, fixing it means editing a repo file and rebuilding.
- **This ticket expires one of 03's premises.** 03 records that a `ParserError` is invisible to a
  player because `playerIndex.ts` throws its error list away. Decision 8 gives the player its first
  error surface, so that stops being true.

## `TODO` goes stale when this lands

Not edited here - `TODO` describes what is *not yet done*, so editing it before the work lands would
make it lie. But whoever finishes this ticket should not have to rediscover which places went stale:

- The **`URL payload becomes a two-document YAML stream`** item and its **`player save keying`**
  child, both of which this ticket does.
- The ordering edge beginning **"Two-document URL payload before player save keying"**, which is
  satisfied inside one ticket rather than across two.
- The **`== EDITOR ==`** section, which has no entry for manifest editing at all.

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
  independent of where the manifest is edited. See the boundary above.
- **Making the renderers survive a missing asset.** They throw on null rather than degrading, so a
  story that reaches a declared-but-missing file still dies mid-render. Reporting it at adoption time is
  this ticket; deciding what a missing sprite looks like on screen is not.
- **Invalidating saves when a story changes.** Accepted for now: the `id` names the project, not the
  version of its script, and an author who needs a clean slate can append a version to the `id`, which
  is the save key. Payload versioning or content addressing would do it properly and belongs with the
  `TODO` item that already carries them.

## See also

- `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` - the error-handling rule, and the
  consequence that named this ticket
- `docs/adr/0003-the-url-payload-carries-the-manifest.md` - decision 8 as a standing contract, written
  because the next reader will try to accept a bare script for backwards compatibility
- `docs/adr/0001-manifest-seeds-the-initial-state.md` - why `id` is not in `VnPlayerState`, which is
  what makes the save rekey a threading problem rather than a lookup
- `design-docs/EDITOR.md` - the CM6 migration, and the `swapDoc` row in its 5.x-to-6 table that this
  ticket's mechanism is chosen from
- `design-docs/SCRIPT_INCLUDES.md` - the single-buffer audit with line numbers, and the multi-buffer
  design this ticket builds a two-buffer subset of
- `design-docs/PROJECT_STORAGE.md` - where the manifest text eventually lives, and the `vn-save-<id>`
  key this adopts
- `ROUGH_EDGES.md` - the stale-save entry this narrows to its remaining half
- `.scratch/asset-manifest/issues/03-undeclared-assets-are-parse-errors.md` - the other half of
  "declared before it exists is the normal authoring order"
- `TODO` - item `A` for the disposable-feature precedent this ticket turned out not to share, the
  multi-buffer line under the CM6 migration, and item `T` for the missing editor tests
- `src/types/screenOrientation.d.ts` - the global-augmentation pattern the `Doc` gutter methods need
- `src/editor/editor.ts`, `src/index.ts`, `src/playerIndex.ts`, `src/demoStory.ts`,
  `src/core/player.ts` (`reloadStory`), `src/core/save.ts`, `src/assetLoaders/`,
  `src/yamlParser/parseManifest.ts`
