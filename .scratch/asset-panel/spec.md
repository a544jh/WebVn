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

The panel, the button, and the label list. Not asset renaming, not asset deletion, not a preview,
and nothing about where bytes come from - `AssetResolver` already settled that in tranche 1.

## The canvas is binding for pixels

<https://claude.ai/code/artifact/c6d9544c-a7dd-49b4-b778-9e22a0e80f71>, page **Asset panel**. Four
artboards - the panel populated, a declared file that is not there, a project with nothing declared
yet, and a manifest that does not parse - and six notes carrying the reasoning in more detail than
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

**2. Add asset writes the manifest, and that is the whole mechanism.** Copying a file into
`projects/<dir>/assets/` is half of it: an undeclared file is invisible to the engine. The button
must also insert the declaration into the manifest buffer and adopt it - not wait for blur, because
the author did not type this and no blur is coming.

Which is why it is **gated on the manifest parsing**, exactly as Copy player link and Export ZIP
already are: there is nowhere safe to insert a line into a document that does not parse, and ADR
0002 says a manifest that does not validate has no identity at all. Greyed rather than hidden, so
the gate says what it is gating.

**3. A missing file is orange, and it is marked in the manifest.** `reportMissingFiles` already
looks the key up with `declarationLocations(this.manifestDoc.getValue(), ...)` and calls
`markErrors("manifest", errors)` - the warning lands on the line that *declared* the file, because
that is the edit that caused it and a filename is the one thing an author cannot check by reading
the two documents. The panel adds a third place that says so, not a different answer.

**4. Nothing is marked as fine.** Green means stored, orange means "needs attention and the work
still runs", red means "did not parse, or a write failed". Spending green on "the file is there"
would cost that meaning, which `.scratch/project-library/design.md` says outright.

**5. The session gets wider; the stage never scales.** 1280 + 12 + 280 inside the page's own 40px
gutters, and the page scrolls sideways on a narrow window. Scaling the preview to make room is the
one option that is not free: `BackgroundRenderer`, `SpriteRenderer` and `FreeformTextRenderer` each
read the root's `clientWidth`/`clientHeight` in their **constructors** and the background canvas is
sized from what they read, so anything that makes the stage's measured size depend on a sibling
reopens the 0x0-canvas bug `AppShell.ts` already orders its swap around. The fixed 1280x720 is what
makes a column beside it safe.

## Deferred, decided rather than forgotten

- **Clicking an asset row does nothing.** Inserting the id at the cursor is the obvious next
  affordance and is deliberately not in this tranche: it is a *script* edit driven from a *manifest*
  view, it has to decide what happens when the cursor is somewhere the id is not legal, and
  `EDITOR.md`'s completion menu is a better home for "put this id in the script" than a side panel
  is. Revisit after the CM6 migration, with the completions.
- **Renaming and deleting an asset from the panel.** Renaming an id is a find-and-replace across the
  script that nothing in this codebase can currently do safely; deleting one is that plus a file
  removal. Both want the reference pass (`checkReferences`) to tell them what would break.
- **Which jump mode a label click uses**, and whether a label jump becomes its own recorded
  `VnPath` action. That is a `core/` change with its own blast radius and it is not this tranche's -
  see ticket 03, which specifies the list against today's `goToLine` and names the question.

## The tickets, in dependency order

1. **`01-the-asset-panel.md`** - the column, the layout, the list over the three declarations, the
   two chevron icons, the missing-file and empty states, and what the panel shows while the manifest
   does not parse.
2. **`02-adding-an-asset.md`** - the button: the file picker, the copy into `assets/`, the
   declaration written into the manifest buffer, the adoption, and the parse gate. Needs 01.
3. **`03-the-label-list.md`** - the second panel, and `goToLabel` on `VnEditor`. Needs 01 for the
   column; independent of 02.

02 and 03 are parallel after 01. **01 can land alone** and is worth having alone: a read-only list
of what a project declares is useful before anything can write to it, and it is the surface every
later ticket hangs from.
