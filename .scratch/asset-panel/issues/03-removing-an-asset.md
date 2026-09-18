# 03: Removing an asset

Status: done

Blocked by: 01 (the asset panel), for the row controls it lives in.

## What to build

A **remove** control on every asset row. It takes the declaration out of `manifest.yaml` and the file
off disk, after a confirmation that says how much of the script is about to stop drawing.

`docs/adr/0006-removing-an-asset-deletes-its-file.md` is the decision and the reasoning; this ticket
is the build. Read it first - the file going with the declaration is the part a reader will want
justified.

## Not actors

The control is on **asset** rows only: a background, an audio track, an individual sprite. Not on an
actor's row, and not on the three group headers.

An actor is cast rather than an asset. Removing one would take a whole `assets/sprites/<Actor>/`
directory with it, and the two lowercase actors are the engine's own - removing `narrator`'s
declaration drops its styling and leaves the actor exactly where it was, which is a button that does
not do what it says. Actors leave the cast by a manifest edit, and the panel does not pretend
otherwise by offering a control that means something different on two kinds of row.

## The confirmation

Names three things: the id, **the file it is about to delete**, and how many script lines name the id.

The file is named because the id and the filename are different things and the author picked the row
by id - `cliffs` and `cliffs-final-v3.png` are the same row, and only one of them is about to be
destroyed.

The count comes from `checkReferences`, which already walks the built command list looking for ids no
declaration answers. Wording along the lines of *"`cliffs` is named on 4 lines in script.yaml. They
will stop drawing anything until you declare it again."* - which is true, and is ADR 0004 stated
where the author needs it.

**It warns and proceeds; it never refuses.** Replacing an asset you are mid-way through swapping out
is an ordinary thing to be doing, and the engine does not need protecting: a reference to a removed
id is neutralized at its index, not a crash.

Use `src/chrome/dialog.ts`. `confirmDestroyingProject` is the shape but not the wording - a project's
dialog says the work cannot be recovered, and an asset's should not borrow that weight when
re-adding the file restores everything the script had (see ADR 0004). The bytes are gone either way;
the story is not.

## The two writes

1. **Remove the declaration** from the manifest buffer and adopt, exactly as ticket 02 inserts one -
   textual splice located with `declarationLocations`, never parse-and-re-`stringify`, and carrying
   `editor.ts:320`'s guard: if the located line holds more than the declaration, refuse and say so
   rather than mangle the document.
2. **Delete the file**, through the store.

Order is declaration-then-file, the reverse of adding. Adding writes the file first so the adopt does
not flash a missing-file warning; removing has the opposite hazard - a file deleted while its
declaration still stands *is* that warning - so the declaration goes first and the adopt afterwards
never sees the gap.

If the file delete fails after the declaration is out, the asset is gone from the project and a
stray file is left. Say so in the console and leave it; the next thing to sweep it is out of scope,
and the author's project is in the state they asked for.

## Gated, like every write this panel does

Disabled while the manifest does not parse - the panel is showing the last manifest that *was*
adopted, so a row may name a declaration the buffer no longer has, and removing from a stale list
destroys the wrong file. Disabled while another of the panel's jobs is in flight, the way
`ProjectPicker` disables every control: a field the draw reads, not a poke at a live control.

## Undo

Nothing special is built. The manifest edit is an ordinary buffer change with full CodeMirror
history and the file delete is not, so Ctrl+Z after a removal restores the declaration and the asset
comes back as a **missing asset** - orange, on the line that declared it, with ticket 04's replace as
the way to fix it. That is a state the panel already draws and already explains. See ADR 0006's
consequences: enrolling a filesystem delete in a text editor's undo stack is a much larger idea than
this panel, and the rename revert already has the same asymmetry.

## Tests

`test/browser/`, through `startEditor`:

- removing a background takes the line out of the manifest and the row out of the panel
- the file is gone from the store afterwards
- the confirmation names the file and the number of script lines that reference the id
- cancelling writes nothing at all - no buffer change, no delete
- a script referencing the removed id still parses, with a WARNING on that line and a `NoOp` at the
  same index (ADR 0004's guarantee, asserted here because this is what makes removal safe)
- no remove control on an actor row or a group header
- the control is disabled while the manifest does not parse

## Comments

**Landed 2026-09-18** (`47f3c7f`). `AssetPanel.remove` plus `undeclareAsset` in
`src/yamlParser/manifestEdit.ts` and `removeProjectFile` in the store;
`test/browser/RemoveAsset.test.ts` covers the two writes, the confirmation's wording, the cancel, ADR
0004's guarantee, the absent control on an actor row, and the gate - with one test through the
store-backed boot that ships, which is what proves the file really comes off disk.

**`referenceCount` is in `src/core/commands/references.ts`, beside `checkReferences` rather than
inside it.** The ticket says "the count comes from `checkReferences`", which walks the list looking
for ids the manifest does *not* answer - the opposite question. Two decisions in it worth recording:
it counts distinct **lines** rather than commands, because that is what an author counts when they
look at their script; and it asks a `NoOp` what it replaced, because a command that named this id and
also named an undeclared one is still a line that will stop drawing. `test/unit/referenceCount.test.ts`
pins both, and says why no `bg` appears in it - its `transition` is a `z.enum` over transitions that
register from `src/domRenderer/`, so in node every `bg` line is a warning.

**The confirmation names nothing when nothing names it.** The ticket's wording assumes a count worth
saying; at zero, "is named on 0 lines" reads as a mistake, so the row says
"`cliffs` is not named anywhere in `script.yaml`." - which is the useful half of the same fact.

**Found in review, and it was the worst bug in the tranche**: removing an actor's last sprite left
`sprites:` with nothing under it, which YAML reads as null, and `actorSchema.sprites` was the one
declaration not wrapped in `declared()` - so the manifest stopped parsing *after* the file had been
deleted, which is a project the author cannot open to fix. The three top-level groups have always
read "declaring nothing and declaring emptiness are the same statement"; this one now does too, which
also fixes an author who types `sprites:` and stops.

`work()` also starts nothing on a stopped panel now. A dialog is modal but a `popstate` is not, so a
write could begin after `close()` had released the project lock and torn the renderer down. Running
the panel's jobs in `AppShell.queue` the way the picker's run is the complete answer and is a bigger
change than this panel.
