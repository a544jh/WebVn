# Removing an asset deletes its file

The asset panel's **remove** takes an asset out of the project entirely: its declaration comes out of
`manifest.yaml` and its file comes off disk. It is confirmed, and it is irreversible - OPFS has no
trash and nothing here keeps a copy.

The alternative, and the one that looks safer, is to remove only the declaration and leave the bytes
where they are. That is the decision this file exists to refuse.

## Why the file goes too

**An undeclared file is invisible and permanent.** Nothing in the editor lists a file the manifest
does not declare - the panel is a view of the manifest, deliberately, so a file with no declaration
appears nowhere at all. An author who removed thirty sketches over a month would have no way to see
that any of them were still there, and no way to get rid of them short of hand-editing OPFS, which
the app offers no surface for.

**And `exportProject` walks the project tree.** So every one of those thirty rides into the
`.webvn.zip`, and into whoever imports it. A "removed" asset that quietly ships to everyone the
author sends their project to is not a safer default; it is the same destruction deferred to a
moment when the author has stopped thinking about it, plus a privacy question nobody asked for -
the cut sprite of a character written out of the story is still in the file they emailed.

**It is also the shape this codebase already refuses elsewhere.** `recoverProjects` sweeps
directories with no `manifest.yaml` rather than letting them sit, on the reasoning that a tree
nothing points at is residue rather than data. A declared-then-undeclared asset file is that, one
level down.

## Why it is tolerable, which is ADR 0004

Deleting a file an author may still be using would be hard to justify if a reference to it were
fatal. It is not, and `0004-an-undeclared-reference-neutralizes-its-command.md` is why.

A script naming an id the manifest no longer declares gets a **WARNING against the line that names
it**, and the command becomes a `NoOp` **at the same index** - so the story still plays, every save
still replays, and nothing shifts under any recorded path. Declaring the id again mints the real
command back where it was.

So removal is destructive to the bytes and *not* destructive to the script. The scene stops drawing
its background and says so on the line; it does not break, and it repairs itself the moment the id
is declared again. That asymmetry is what makes one confirmation enough.

The confirmation names the count for the same reason: `checkReferences` already walks the built
command list, so the dialog can say "`cliffs` is named on 4 lines in script.yaml" and let the author
decide with the number in front of them rather than after.

## Why `remove` and not `delete`

`delete` is the picker's word and it ends a whole project - `deleteProject`, `forgetProject`,
`confirmDestroyingProject`, and a dialog that says the work cannot be recovered. Both operations are
destructive and irreversible, so the heavier word stays with the heavier scope. `CONTEXT.md` carries
the entry.

## Consequences

- **Undo is asymmetric, and accepted.** The manifest edit is an ordinary buffer change with full
  CodeMirror history; the file delete is not. Undoing a removal restores the declaration and the
  asset comes back as a **missing asset** - orange, marked on the line that declared it, with the
  panel's replace control as the way to fix it. That is a state the editor already draws and already
  explains, which is why no attempt is made to enrol a filesystem delete in a text editor's undo
  stack. The rename revert already has the same asymmetry.
- **An actor cannot be removed from the panel at all**, only its individual sprites. An actor is
  cast rather than an asset, removing one would take a whole directory with it, and the two lowercase
  actors are the engine's own - `default` and `narrator` - where removing the declaration would drop
  styling rather than the actor, which is a button that does not do what it says. Actors leave the
  cast by a manifest edit.
- **Remove is gated on the manifest parsing.** While it does not parse the panel shows the last
  manifest that was adopted, so a row describes a declaration the buffer may no longer have -
  and removing from a stale list would destroy the wrong file. The same gate covers add and replace,
  so the rule is one sentence rather than two and an exception.
