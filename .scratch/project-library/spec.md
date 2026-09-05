# The project library

Tranche 2 of `design-docs/PROJECT_STORAGE.md`. Tranche 1 built the store - a project lives in OPFS at
`projects/<id>/{manifest.yaml,script.yaml,assets/}`, the editor boots out of it and stores both
buffers back, and a second tab is refused by a lock. It shipped the layout for many projects and the
UI for one, which is the design doc's own sequencing rule and what lets this tranche arrive without a
migration.

This tranche is what makes that layout visible: an author can see the projects they have, switch
between them, make a new one, delete one, and rename one. It is the half of "the editor holds a
library of projects, not a single loaded one" that the store could not deliver by itself.

Its own directory rather than more numbers under `.scratch/project-storage/`, because that spec is
tranche 1's and says so throughout - what it does *not* do is most of what this one is.

Its design is settled: `design.md` holds the decisions and links the canvas the drawings live on.
The picker is a **page shown before the editor boots**, not the panel this spec first described - see
that file for the three consequences, which are amended into ticket 02.

## The tickets, in dependency order

0. **`00-editor-chrome-vocabulary.md`** - the chrome's font and icon helper. A prefactor like 01, and
   numbered 00 rather than renumbering the rest. Everything visible below draws from it.
1. **`01-closing-a-project.md`** - the teardown that switching needs: `close()` on the boot, `stop()`
   on the storer, the renderer's document listeners and timers, and the first caller of
   `ProjectLock.release`. No UI, and a prefactor: every ticket below remounts in the same page.
2. **`02-the-project-library.md`** - the page that lists projects and opens one, plus the editor's
   way back to it. The first ticket an author can see, and where `lastOpened` finally does work.
3. **`03-new-and-deleted-projects.md`** - making a project and destroying one, plus the editor's own
   confirm surface that 04 reuses.
4. **`04-renaming-a-project.md`** - the manifest's id becomes the project's directory: copy, commit,
   delete, reopen, with the quota check and the overwrite confirmation.
5. **`05-recovering-a-crashed-rename.md`** - the startup reconcile that makes 04's blur trigger safe,
   and the sweep that deletes what a crash left behind.
6. **`06-what-a-project-costs.md`** - per-project size in the library, and `persist()`.

Linear, except that 06 hangs off 02 rather than off the rename chain. The frontier is otherwise top
to bottom.

## What this tranche deliberately does not do

- **No export nag, and no "last exported" date.** The design doc wants both in the library, beside the
  size, and they cannot land here: there is nothing to export yet. The `?vn=` payload carries the
  manifest and script and no assets, and `CONTEXT.md` reserves *export* for the archive that carries
  them. A date field nothing ever writes is the "field nobody can tell is dead" that
  `.scratch/project-storage/issues/04-project-store.md` refuses on `editor.yaml`. It lands in tranche 3
  beside zip export, under that effort's own hard constraint - export must not ship ahead of zip
  import. Ticket 06 ships the half that is buildable now and says this where the field would go.
- **No import, no export, no zip.** Tranche 3, with its own spec. The recursive copy ticket 04 builds
  is written to be the one that effort shares, but nothing here is written against a `SourceLoader`:
  that shape belongs to `design-docs/SCRIPT_INCLUDES.md`, and inventing a second file abstraction
  here is the exact mistake its sequencing section warns about.
- **No linked folder.** After zip, per the doc's sequencing.
- **The demo seed survives.** `src/storage/seedDemoProject.ts` is doing two jobs, and this tranche
  retires only one of them. The picker takes over "keep the editor alive when the library is empty" -
  its "new project" is that answer - but "make first run good" is the demo specifically, and only a
  URL import of the demo published in `dist/` retires that. Delete the seed after ticket 02 and a new
  author's first experience becomes an empty project instead of a story, which is worse than today.
  The seed dies in tranche 3, and its comment already says so.

## Cross-edges worth remembering

- **The lock is taken before the old project is closed, not after - but this belongs to ticket 04
  now, not 02.** It exists because a swap made *while holding a project* can be refused, leaving the
  author with nothing. Since the picker became a page, 02 is never in that position: it released on
  the way out, and a refusal just leaves the author on the list. A rename still is, so the boot still
  grows a way to be told which directory to open and to refuse *before* anything is torn down, and
  the two locks being keyed on different directories is what makes holding both across that swap
  safe. See `design.md`.
- **`ProjectStoring`'s three listeners are a data-loss bug the moment this tranche starts.** Measured
  2026-09-05 and written into its constructor: a superseded storer keeps flushing, and on a switch
  back it queues older text last, which per-path serialization then lets win. Ticket 01 is first for
  this reason and not only for tidiness.
- **The recovery sweep must not delete a directory another tab holds.** Between step 4 and step 5 of
  a rename both the source and the destination are valid projects, so a second tab can legitimately
  have opened the source before this tab boots and tries to finish the delete. Ticket 05 takes the
  lock on what it is about to delete and leaves the marker for the next boot if it cannot.
- **Per-project size does not come from `navigator.storage.estimate()`.** That is origin-wide. The
  figure comes from summing the sizes `walk` already yields, which is why `WalkedFile` carries one.
  Filed in tranche 1's spec against exactly this ticket, and repeated here because that is the
  discovery it was written to prevent.
- **A project whose manifest does not parse is listed, with its directory name.** The store keeps it
  listable deliberately: it is an author's project with a typo in it, and the library is the one place
  they would go to open it and fix it. Hiding it there would undo the reason `ProjectSummary` carries
  a nullable id at all.
