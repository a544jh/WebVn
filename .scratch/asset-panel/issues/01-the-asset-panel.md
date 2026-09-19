# 01: The asset panel

Status: done

## What to build

A column to the right of the stage listing everything `manifest.yaml` declares: three groups
(Backgrounds, Audio, Actors), one level of nesting under an actor, ids as leaves. Read-only. The
`Add asset` button is drawn in its footer and does nothing yet - ticket 02 wires it.

The canvas draws all of it: `AssetPanel`, `AssetMissing`, `AssetEmpty` and `AssetGated` on the
**Asset panel** page. Read those before starting; this file is the reasoning and the wiring, not the
layout.

## Where it lives

`src/editor/assetPanel.ts` plus its own `assetPanel.css`, imported by it, per the CSS convention.

`src/editor/` rather than a new directory, and this is a judgment call worth recording: everything
the panel touches is the editor's. It reads the manifest `VnEditor` adopted, it subscribes to
`VnEditor.onManifestAdoptedCallbacks`, and ticket 02 has it writing into `VnEditor`'s manifest
buffer. `src/picker/` is the other view and this is not that; `src/chrome/` is what the editor and
the picker *share* and this is not shared. The cost is that `src/editor/` stops meaning strictly
"the CodeMirror editor" - `EDITOR.md` is about that component and this is not part of it. Accepted
because the alternative is a directory holding one file whose every dependency is next door.

**Mounted by `editorBoot.ts`**, which is the session's composition root and already holds the
player, the renderer, the editor and the storer. Not by `src/index.ts` - the entry point self-boots
on import and looks its elements up by id, so nothing put there can be reached by a test.

## Where the data comes from

`VnPlayerState` carries the manifest's three declarations, seeded by `seedState`. So the panel reads
`player.state.actors`, `player.state.backgrounds` and `player.state.audioAssets` - not a manifest
object held on the side. `seedState` copies them in and `advance` never writes them, so the state is
as authoritative as the manifest and is the thing already threaded everywhere.

**A file's path comes from `src/domRenderer/assetPaths.ts` and nowhere else.** The panel shows the
declared filename, which is the map's value and needs no path built at all - but if it ever wants a
path, `xAssetPath(declarations, id)` is the one place an id becomes one. Do not re-spell
`assets/backgrounds/` here.

## When it redraws

Two triggers, both existing seams:

1. **`VnEditor.onManifestAdoptedCallbacks`** - a manifest adopted on blur is the only way
   declarations change while a session is open. `AppShell.rename` already listens to this.
2. **The initial mount**, from the state `editorBoot` loaded.

Not `renderer.onRenderCallbacks`: declarations do not change per frame, and the label list in ticket
03 is the one that does want a per-render read.

## What it shows while the manifest does not parse

The declarations of **the last manifest that was adopted**, which is ADR 0002's other half: a
manifest that does not validate is not adopted, so the preview - and the panel - are running a
different one. The panel says so in its own title strip, in the muted grey the picker uses for a
secondary line: without that line the author reads a stale tree as a current one.

It does not empty itself and it does not go red. The red is on the manifest tab, where it belongs,
and repeating it here would be a second complaint about one problem.

## A declared file that is not there

Orange on the leaf's filename, plus a short `not drawn yet` beside it, and **orange on the group
header too** so a collapsed group still says something under it needs attention. That is the rule
`refreshTab` already applies one level up - a tab wears the worst level marked in its own gutter -
so a summary cannot drift from what it summarises.

Where the panel learns which files failed: `loadAssets` resolves with the **declarations** whose
file could not be loaded - the path plus the manifest key it was declared under - scoped to the
state it was given. `VnEditor.reportMissingFiles` already consumes exactly that to mark the manifest
gutter. The panel needs the same list, so hand it to both rather than loading twice; the key is what
makes a row findable, and it is the reason `loadAssets` reports keys rather than paths alone.

Not an error, and the story still plays: declaring art before it is drawn is the normal authoring
order.

## Nothing declared yet

`Nothing declared yet.` over a second line pointing at the two ways out - the button below, or
writing it into `manifest.yaml` by hand. Centred and muted, the `.vn-picker-empty` treatment
(`26px 8px 28px`, 13px, `#555`). This is what a project straight out of `mintProject` shows, whose
manifest is `formatVersion`/`id`/`title` and nothing else.

## Pixels that are decisions

- **Flat contiguous rows in a white well**, nesting by indentation. Not `.vn-picker-project`'s
  bordered white cards on grey: a picker row is page-width and holds three lines, and the same
  treatment in a 280px column reads as a stack of cards rather than a list you scan.
- **The id leads, in `--vn-editor-font-mono`** - the chrome's own monospace, the face
  `.vn-picker-identifier` gives an identifier - and holds its width. The filename trails it, muted,
  and truncates with an ellipsis. **A row never wraps**, or the list stops being scannable at
  exactly the long names where scanning matters.
- **The column is 280px**, and the session gets wider rather than the stage smaller. See the spec's
  decision 5 before changing that: it is the 0x0-canvas hazard, reached from a new direction.
- The `Add asset` button is deliberately larger than `.vn-chrome-button` - it is the panel's one
  action rather than a tool in a row of them - which makes it a new metric belonging in
  `assetPanel.css` and not in `chrome.css`.

## The row's controls, and the column's second panel

This ticket builds the **structure** the controls sit in, not the controls - each belongs to the
ticket that makes it do something (02 has none, 03 has remove, 04 has replace and preview).

**They overlay the filename on hover and on focus.** The filename is reference information you read
while scanning; the controls are what you want once you have stopped scanning and picked a row, so
the two never compete for the same pixels. Overlay rather than reflow: a row that changes width
under the pointer is the flicker `.vn-picker-drop` documents at length. Muted until reached for,
and remove goes red on hover - `.vn-picker-control`'s treatment exactly.

Three controls on a 280px row is tight and the canvas draws a first attempt at it. **Expect this to
be tweaked once it is on screen** - it is the one part of the panel nobody has seen working.

**The column is two stacked panels**, with this one taking the remaining height. The second is the
label list, which is `.scratch/label-list/` and not this tranche's - the canvas draws it, and its
note says whose it is. Build the column so landing it later changes a number rather than the layout.

## Icons - done, ahead of this ticket

`src/chrome/icons.ts` imports from `lucide` per icon rather than carrying transcribed path data, so
every icon this panel needs already exists: `chevron-down` and `chevron-right` for the groups, `eye`,
`replace` and `trash-2` for the row controls.

**The package's data shape is why this stopped being work.** An `IconNode` is a list of
`[tag, attributes]` pairs, so `draw` renders whatever element each entry names. The hand-vendored
version held a list of `d` strings and could only emit `<path>` - which is why `eye` (a path and a
circle) and `replace` (six paths and a rect) were unbuildable, and why the four per-group type icons
were dropped. **They are buildable now**, if the design ever wants them back.

Row controls are **15px**, matching what `.vn-picker-control` already draws its row icons at. The
chevrons are 13px.

## Teardown

A `stop()`, and `editorBoot`'s `close()` calls it. The panel's callbacks on the renderer and the
editor die with those objects - both are rebuilt per session - but any listener it puts on an
element it did not itself create outlives the session, which is precisely the data-loss shape
`ProjectStoring`'s constructor comment documents. Own the root, `replaceChildren()` on every draw,
and an `AbortController` for anything else.

## Tests

`test/browser/`, through `startEditor(manifestText, script)`:

- a manifest declaring two backgrounds and an actor draws the groups and the leaves
- `typeManifest` + `blurEditor` adding a declaration redraws the list
- a manifest that does not parse leaves the list showing the previous declarations, and the panel
  says it is stale
- a declared file that is not there is orange on the leaf and on its group header
- a manifest with no declarations shows the empty state
- a row's controls appear on hover and on keyboard focus, and do not change the row's width

Name this suite's OPFS project directories after the suite - `navigator.locks` is origin-wide and
two browser suites sharing a directory name contend for one lock even in separate scratch roots.

## Comments

**Landed 2026-09-18**, with 02, 03 and 04 on one branch (`89bd759`). `src/editor/assetPanel.ts` plus
`assetPanel.css`, mounted by `editorBoot` and stopped by its `close()`;
`test/browser/AssetPanel.test.ts` covers the groups, the redraw, the stale strip, both halves of the
missing-file state, the empty state and the teardown.

**The enumeration is its own module, `src/editor/declarations.ts`**, which the ticket did not ask for
and the spec's "whatever this builds to enumerate declarations and labels should be the thing the
completions later read" does. It is pure and unit-tested (`test/unit/declarations.test.ts`), so a
completion source can read it without importing a view.

**One thing the state and the manifest disagree about, settled here.** The panel reads
`player.state.actors` as the ticket says, and `seedActors` merges `default` and `narrator` in on
*every* boot whether or not the manifest mentions them - so a plain walk drew two actors nobody had
written down. `declaredGroups` drops the engine's two unless they declare sprites, because at that
point an author did write them. Worth flagging: this is the one place the state is not simply the
manifest.

**`VnEditor` grew two seams rather than one.** `onManifestSettledCallbacks` is the panel's single
redraw signal, and it fires on a *failed* adoption too - which the ticket's trigger list does not
mention, and has to, because "the manifest stopped parsing" is a change to what the panel is showing
even though nothing downstream moved. `getMissingAssets()` is the second: the ticket says "hand it to
both rather than loading twice", and this is that, with `reportMissingFiles` as the one assignment so
the gutter and the panel cannot describe different loads.

**The hover/focus test landed with 03**, which is the first ticket that puts a control in a row -
there was nothing to hover until then. The controls are hidden with `opacity` rather than
`display: none`, because a `display: none` control is not in the tab order and the keyboard half of
"appears on hover and on focus" could never happen.

**`#vn-editor` is now 1280px wide**, which the ticket does not mention and the canvas draws. Without
it the buffers stretched to the session's new 1572px and stopped lining up under the stage.

**Found in review**: the panel `replaceChildren`es its root on every settle, and one of the things
that fires a settle is the manifest being adopted on blur - which is what clicking the panel does.
On the failure path that redraw is synchronous, so a control pressed while the manifest buffer is
dirty and broken is detached between mousedown and mouseup. What it costs is one lost press of
preview, the only control live in that state; `ROUGH_EDGES.md` has the mechanism and why a diffing
draw is not worth building for it.

**The column's remaining height was never bounded, so a long list grew the page.** Reported
2026-09-19: the asset list should have a fixed height and scroll. The panel had the right two
declarations from the start - the list is `flex: 1; min-height: 0; overflow-y: auto` - and the height
they were remaining out of did not exist. `#vn-session-stage` relied on `align-items: stretch` to
give the column the stage's height, which is not what stretch does: a flex line's cross size is the
*largest* of its items' content heights, so a column taller than the scene grew the row rather than
being bounded by it. Measured at 1956px for 82 declarations. `#vn-session-column` now says
`height: 720px`, a literal for the reason `#vn-editor`'s `width: 1280px` beside it is one, and the
list scrolls inside a panel that ends level with the bottom of the scene.

It was invisible to every suite because `createPanelRoot` mounted the panel straight onto `body`,
where `flex: 1` and `min-height: 0` mean nothing - so the harness now puts it in a
`#vn-session-column` the way `src/index.html` does, and `AssetPanel.test.ts` pins the panel's 720px
and the list's overflow. Verified by deleting the height and watching that test go red.
