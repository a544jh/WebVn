# The asset panel

The editor gains a column to the right of the stage: a list of everything the project declares, a
button that adds to it, and a list of the story's labels that jumps the playhead. Settled
2026-09-11, over a design session whose drawings are on the canvas linked below.

**No design doc governs this.** `PROJECT_STORAGE.md` is about where files live and its remaining
work is tranche 4 (URL import, the static folder, the linked folder, the nag); `SCRIPT_INCLUDES.md`
is about N script files; `EDITOR.md` is about completion and the CodeMirror 6 migration. None of
them prescribes a panel. That is stated here rather than left silent, because the house rule is to
check whether a doc has already decided something before deciding it again - this was checked.

**One overlap is worth naming.** `EDITOR.md`'s completion table wants *"asset names from the
manifest"* for an `image:`/`sprite:`/`audio:` value and *"label names from `state.labels`"* for a
`jump:` value. That is this tranche's two data sources, surfaced a second way. Whatever this builds
to enumerate declarations and labels should be the thing the completions later read, or the panel
and the menu will come to disagree about what a project contains.

## Scope

**The panel and its three writes**: add an asset, remove one, replace one's file. Plus preview, which
is the one control that writes nothing.

Not asset renaming - renaming an id is a find-and-replace across the script that nothing in this
codebase can currently do safely, and it wants `checkReferences` to say what would break first. Not
the label list, which shares the column and nothing else and is now `.scratch/label-list/`. Nothing
about where bytes come from; `AssetResolver` settled that in tranche 1.

**The point of the tranche is that an author cannot currently add a file to a project at all.** The
only `<input type="file">` in the codebase is the picker's archive import, so someone who draws a new
background has exactly one route: build a `.webvn.zip` outside the browser and import it. This is the
same shape as tranche 3, whose dialogs all said "there is no export yet" until it made that false.

## The canvas is binding for pixels

<https://claude.ai/code/artifact/c6d9544c-a7dd-49b4-b778-9e22a0e80f71>, page **Asset panel**. Seven
artboards - the panel populated, a declared file that is not there, a project with
nothing declared yet, a manifest that does not parse, and then the Add asset dialog in three states
(a background, a sprite for a new actor, an id already declared) - and seven notes carrying the reasoning in more detail than
this file does. Read it before building anything it draws. Where the drawings and the code disagree,
the code is the one that moved; where this file and the canvas disagree, the canvas is newer.

Page **Project library** is tranche 2's and 3's and is not this tranche's, except that
`EditorReturn.dc.html` on it draws the same session view and must not drift from the four here.

## The decisions, and why they went that way

**1. It is a view of the MANIFEST, not of OPFS.** `actors`, `backgrounds` and `audioAssets` are
keyed maps - the script names an id and the manifest says which file it is - so the panel is a
symbol table with the manifest's shape: three fixed groups, one level of nesting under an actor, ids
as leaves. Showing the OPFS tree instead would let the author browse a file no id answers, which is
the state ADR 0004 exists to make visible in the *script*, not a second place to go looking.

The consequence worth stating: **no tree library, and not a general treeview.** Three collapsible
groups with one nesting level is `<button aria-expanded>` over a list. The fiddly part of a real
`role="tree"` - roving tabindex, arrow-key navigation, type-ahead - is the part this shape does not
have, and a premade component would be imported for the cheap 20% while the expensive 80% (a row
carrying declared-and-present, declared-and-missing, and the manifest's own error state) stayed
hand-written either way.

**2. The panel has three writes, and one rule covers all of them: gated on the manifest parsing.**
While it does not parse the panel is showing the last manifest that *was* adopted - ADR 0002's other
half - so a row may name a declaration the buffer no longer has. Add has nowhere safe to insert a
line; remove would destroy the wrong file; replace would overwrite a file the current manifest does
not point at, silently, since it has no dialog to notice it in. One sentence a reader can hold,
rather than two rules and an exception. Preview writes nothing and is not gated.

The panel also disables everything while one of its own jobs is in flight, the way `ProjectPicker`
does: a field the draw reads, not a poke at a live control.

**3. Add asset writes the manifest, and that is the whole mechanism.** Copying a file into
`projects/<dir>/assets/` is half of it: an undeclared file is invisible to the engine. The button
must also insert the declaration into the manifest buffer and adopt it - not wait for blur, because
the author did not type this and no blur is coming.

Which is why it is **gated on the manifest parsing**, exactly as Copy player link and Export ZIP
already are: there is nowhere safe to insert a line into a document that does not parse, and ADR
0002 says a manifest that does not validate has no identity at all. Greyed rather than hidden, so
the gate says what it is gating.

**4. A missing file is orange, and it is marked in the manifest.** `reportMissingFiles` already
looks the key up with `declarationLocations(this.manifestDoc.getValue(), ...)` and calls
`markErrors("manifest", errors)` - the warning lands on the line that *declared* the file, because
that is the edit that caused it and a filename is the one thing an author cannot check by reading
the two documents. The panel adds a third place that says so, not a different answer.

**5. Nothing is marked as fine.** Green means stored, orange means "needs attention and the work
still runs", red means "did not parse, or a write failed". Spending green on "the file is there"
would cost that meaning, which `.scratch/project-library/design.md` says outright.

**6. The session gets wider; the stage never scales.** 1280 + 12 + 280 inside the page's own 40px
gutters, and the page scrolls sideways on a narrow window. Scaling the preview to make room is the
one option that is not free: `BackgroundRenderer`, `SpriteRenderer` and `FreeformTextRenderer` each
read the root's `clientWidth`/`clientHeight` in their **constructors** and the background canvas is
sized from what they read, so anything that makes the stage's measured size depend on a sibling
reopens the 0x0-canvas bug `AppShell.ts` already orders its swap around. The fixed 1280x720 is what
makes a column beside it safe.

## Deferred, decided rather than forgotten

- **Clicking a row does nothing.** The row's actions are its controls; the row itself is not a
  button. Inserting the id at the cursor was considered and belongs with `EDITOR.md`'s completions
  rather than a side panel - it is a *script* edit driven from a *manifest* view, and it has to
  decide what happens when the cursor is somewhere the id is not legal.
- **Renaming an asset id.** A find-and-replace across the script, which wants `checkReferences` to
  say what would break before it runs.
- **Removing an actor.** Only individual sprites can be removed. An actor is cast rather than an
  asset, removing one would take a directory with it, and `default` and `narrator` are the engine's
  own - removing their declaration drops styling and leaves the actor, which is a control that does
  not do what it says. See ticket 03.
- **Loader eviction.** Ticket 04 rebuilds the loaders rather than evicting, because eviction has a
  test aimed at it (`objectUrlLifetime.test.ts`) and should not be the price of admission for a file
  picker. It is the right change eventually.
- **The label list**, now `.scratch/label-list/`. This tranche reserves the column for it: two
  stacked panels, the asset panel taking the remaining height, so landing it changes a number rather
  than the layout.

## Settled by measurement: the icons are imported

**2026-09-12.** `src/chrome/icons.ts` transcribed Lucide path data by hand, on the reasoning that
"eight chrome icons do not earn a package against the entrypoint size warning the build already
prints". The panel needs eleven, and two of them - `eye` and `replace` - could not be drawn at all,
because an entry was a list of `d` strings and `draw` emitted only `<path>` while those icons carry a
`<circle>` and a `<rect>`.

Measured rather than argued, the way spike H settled zip.js:

| | raw | gzipped |
| --- | --- | --- |
| `app.js` before | 587,491 | 178,638 |
| `app.js` after, **with four icons added** | 588,310 | 178,831 |
| **cost** | **+819** | **+193** |

`playerIndex.js` is byte-identical at 234,752 - the player draws no chrome, so none of it reaches
that bundle. 533/533 tests pass. `lucide` declares `sideEffects: false` and ships one ESM module per
icon, so eleven of roughly fifteen hundred is what webpack keeps.

The size premise was the weaker half of the original reasoning; the stronger half turned out to be
the opposite of what it looked like. **Lucide's `IconNode` - a list of `[tag, attributes]` pairs - is
exactly the generalisation the hand-rolled version needed**, so importing supplied the shape change
rather than requiring one. And the transcription had already gone wrong: the hand-drawn `replace`
used `rect x=2 y=14 width=8 height=8 rx=2` where Lucide ships `x=3 y=14 width=7 height=7 rx=1`, and
the `eye` was an older variant entirely. The canvas is now generated from the package's own export.

## The tickets, in dependency order

1. **`01-the-asset-panel.md`** - the column, the layout, the list over the three declarations, the
   row structure the controls sit in, the two chevron icons, the missing-file and empty states, and
   what the panel shows while the manifest does not parse.
2. **`02-adding-an-asset.md`** - the button, the dialog, the copy into `assets/`, the declaration
   spliced into the manifest buffer, the adoption.
3. **`03-removing-an-asset.md`** - the control, the confirmation with its reference count, the two
   writes, and `docs/adr/0006`.
4. **`04-replacing-and-previewing-an-asset.md`** - the two remaining controls, the loader rebuild
   that makes replace actually show, and the one `Renderer` change.

2, 3 and 4 are parallel after 01, and **that is the useful property**: the manifest splice, the
destruction and the interface change each land alone and none rides in on another. **01 can land by
itself** - a read-only list of what a project declares is worth having before anything can write to
it, and it is the surface the other three hang from.

All four landed 2026-09-18. **`05-a-thumbnail-on-the-row.md` is not one of them**: filed 2026-09-19
out of using the panel, it is the first thing the row would draw that is neither the manifest's text
nor a fixed glyph, and it wants an artboard and three decisions before any code. Its own file says
which.
