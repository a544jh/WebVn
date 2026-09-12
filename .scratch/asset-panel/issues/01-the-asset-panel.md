# 01: The asset panel

Status: ready-for-agent

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

## Icons

`chevron-down` and `chevron-right` into `src/chrome/icons.ts`'s `PATHS`. Both are single paths, so
`draw()` takes them as they stand.

Per-group type icons (image/music/user/tag) were drawn on the canvas and dropped: the group is
named, so the picture said nothing the word did not, and four of them would have needed `<rect>` and
`<circle>`, which `draw()` cannot emit. Recorded so the next reader does not re-add them and then
discover why that file has to change shape first.

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
