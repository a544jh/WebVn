# 01: Importing an archive

Status: done

Blocked by: nothing. First of the tranche, and the doc's hard constraint is that ticket 02 does not
merge without it.

## What to build

A `.webvn.zip` on the author's disk becomes a project in the library. The picker gains an **Import
project** button and accepts a dropped file; the archive is validated whole before a byte is
written; a taken id is overwritten or the import is cancelled.

## The surface

**On the picker, beside New project and Add demo project.** A hidden `<input type="file"
accept=".zip">` behind the button, plus `dragover`/`drop` on the picker page.

**The icon is the arrow going INTO the tray** - Lucide's `download` glyph, which the picker vendors
per `src/chrome/icons.ts`'s "add path data per ticket rather than vendoring a set nobody calls".
Direction follows the data, not the verb: import brings a project in, so the arrow points in, and
export's points out. Drawn the other way round first, and corrected from a comment on the canvas -
an import drawn with an upload arrow and an export drawn with a download arrow left both buttons
pointing the same way, which is what made it wrong rather than merely unconventional.

**A multi-file drop is refused** with a one-line message rather than silently picking one. Importing
three projects from one gesture is a bulk operation nobody asked for, and quietly ignoring two of
three files is the worse failure.

**The author stays on the picker afterwards**, with the new row visible, exactly as **Add demo
project** does. Populating a library and starting work are different intents, and after an import
the author most wants to see the thing arrived intact.

Both listeners come down with the picker's existing `AbortController` and `stop()`. A superseded
view that kept listening is a bug, not untidiness - `ProjectStoring`'s constructor comment has the
reasoning and `design.md` repeats it.

## The seam

```ts
export interface ArchiveEntry {
  readonly path: string
  readonly blob: Blob
}

importProject(entries: AsyncIterable<ArchiveEntry>, …): Promise<ImportResult>
```

**The design doc is wrong where it says import is written against `SourceLoader`.** That interface
is `load(path): Promise<string>` and cannot carry an asset's bytes - a PNG through a `string` is
either corrupt or a base64 detour, and the point of `entry.getData(writable)` is that no
intermediate representation exists at all. `SourceLoader` is the right shape for *includes* (text,
pulled by path, from a known set) and the wrong shape for *ingestion* (bytes, pushed as a stream,
from an unknown set). The doc has been corrected; do not resurrect the claim.

The payoff is that the whole back half - normalization, refusals, caps, collision, the write
ordering - is reachable from `test/unit/` over an in-memory `AsyncIterable`, with no zip library and
no OPFS in the way.

## Reading the archive

`@zip.js/zip.js` pinned to **`lib/zip-core-custom.js`** - see `spec.md` for the measurement and for
why the package root must not be imported (it bakes the build machine's `file://` path into the
bundle and then silently loses its workers).

```ts
const reader = new ZipReader(new BlobReader(file))
```

`BlobReader` slices, so a disk-backed `File` is never held whole; the central directory carries
`uncompressedSize` per entry, so the caps below are arithmetic rather than a watch on the quota
draining. Entries are written with `entry.getData(await handle.createWritable())` where possible so
no decoded entry is materialized.

Sniff **`PK\x03\x04`**, never the extension: renaming a project file must not make it unopenable,
and a drop carries no reliable extension anyway.

## Normalizing the shape

`manifest.yaml` at the archive root. If there is none there, and **every** entry shares a single
top-level directory prefix, strip that prefix and look again. The rule is unambiguous because a
manifest at the root is mandatory, so the two layouts cannot be confused.

This matters more than the layout does: the natural way to re-zip an edited project - macOS
right-click Compress, Windows "Send to compressed folder" - operates on the *folder* and produces a
wrapped archive. A format meant to be opened by hand has to accept what a hand puts back.

## What is refused, and it is always the whole archive

- not a zip (magic bytes)
- no `manifest.yaml` after normalization
- the manifest does not parse
- `formatVersion` is not 1 - `parseManifest` reports this first and alone, by design, so the message
  explains itself
- the id fails `validateProjectId`
- **no `script.yaml`** - see below
- an entry path that is not a plain relative path: any `..` segment, a leading `/`, a backslash, a
  drive letter, or a control character
- over the caps

**Never a partial landing.** *"A partial import is a failure, not a project"* is already the doc's
rule for the URL path and applies harder here, where skipping entries would produce exactly the
project with silent holes that the rename recovery exists to prevent. Report the reason, using the
parser's own messages where there are any.

**`script.yaml` is refused because nothing else would catch it.** `recoverProjects.ts` deliberately
does *not* sweep a manifest with no script - that is the state `createProject` passes through
between its two writes, and sweeping it would be a wrong delete - so a script-less archive would
land, appear in the picker with its title, and then throw out of `readProject` when the author
clicked it. A dead row, in the surface whose entire purpose is opening things. One `exists()` closes
it. Supplying an empty script instead was considered and refused: it converts "this archive is
broken" into "this project mysteriously lost its story", and the author cannot tell which happened.

**What is deliberately not refused**: a manifest declaring files that are not in the archive, a
script with parse errors, and a script naming undeclared ids. Each is an ordinary state of a project
being written, and the editor reports every one of them on the line that caused it. The manifest
gates the archive; the script never does. ADR 0005.

## The caps

Every import needs them from the first one - they cover content the author did not make, and they
are awkward to retrofit.

- **5,000 entries.**
- **2 GB uncompressed**, or the free space `navigator.storage.estimate()` reports, whichever is
  lower. `AppShell` already has `availableBytes` and `roomProblem` from the rename's quota check;
  reuse them rather than writing a second estimate reader.
- Both are checked against the summed `uncompressedSize` from the central directory **before
  inflating anything**, which is what makes a zip bomb an arithmetic problem rather than a race with
  the quota.

They live in the back half, so the URL and folder producers tranche 4 adds are covered without
retrofitting each.

## The collision

The destination directory is the manifest's id. If it is taken: a dialog with **Overwrite** and
**Cancel**, through `src/chrome/dialog.ts` like every other confirm here.

**No rename-on-import**, against the design doc's leaning - `spec.md` decision 2 has the reasoning,
which is that a copy under a different directory mints an id/directory disagreement that
`AppShell.rename` then offers to "fix" by destroying the very project the copy was protecting.

**Ask in the same words the rename's overwrite already asks in.** `AppShell.confirmOverwrite`'s
comment promised this outright - *"an import that collides with an existing id will ask it in the
same words"* - so this is not a new dialog to word, it is that one reused: heading `Overwrite
"<id>"?`, a first paragraph naming `projectFolder(to)` and what is destroyed with it, a second
saying it cannot be recovered, and `confirmDialog`'s destructive styling. Two differences, both
because the source is an archive rather than a project being renamed: the recovery clause can add
that this archive can simply be imported again, and a third line points at the way to keep both -
cancel, rename the project you have, import again - which is what standing on overwrite-or-cancel
owes the author.

**Overwrite drops the destination's player saves** - `deleteSaveData(id)`, matching delete. See
`spec.md` for why keeping them is not safe, and ticket 03 for the `exported` date, which goes the
same way and for the same reason.

## The ordering, which is the rest of the ticket

0. Read and validate `manifest.yaml` out of the archive by random access - **before a byte is
   written**. Everything in "What is refused" is settled here.
1. Take the destination's project lock. Refuse like every other refusal if another tab holds it.
2. On overwrite: `removeRecursive` the destination, and `deleteSaveData(id)`.
3. Write every entry except `README.txt` at the root and except `manifest.yaml`.
4. **Write `manifest.yaml`. This single atomic write is the commit point.**
5. Record `created` **only if the directory is new**. Release the lock.

**An overwriting import keeps the `created` date it found**, and that is a decision rather than an
omission. The picker sorts by creation, oldest first, precisely so that rows do not move under the
author - so minting a fresh date would send the overwritten project to the bottom of the library as
a side effect of replacing its contents. The slot is the same slot; the row stays in it.

Note this is the opposite of what ticket 03 does with `exported`, which an overwrite drops, and the
two are consistent rather than arbitrary: `created` describes the row's place in the library, which
has not changed, while `exported` describes a file on disk that is now a copy of a project nobody
has any more.

**Step 4 is the opposite of `createProject`'s ordering and that is deliberate.** `createProject`
writes the manifest first so a project being minted never looks like residue; import is a copy, and
a manifest written first would mean a crash mid-import leaves a directory that looks like a valid
project with files silently missing. `renameProject` already commits this way. Before step 4 the
destination has no manifest and is therefore garbage; after it, it is a valid project; there is no
third state.

**The crash recovery is free, and the lock is what makes it safe.** `recoverProjects.ts` already
sweeps manifest-less directories on every picker render, so a crashed import needs no marker and no
new recovery code - but a *live* import is in exactly that state, so the sweep must be unable to
reach it. It takes the lock on what it deletes, which is why step 1 is not optional.

**A failed import loses nothing**, which is what makes this ordering enough. Unlike a rename, whose
source is destroyed as part of the operation, the archive is still on disk: re-running the import is
the recovery. The author already accepted the destruction in the overwrite dialog.

## Feedback

The control disables and reads "Importing…"; the picker's existing status line reports the outcome.
No progress bar: import ends in a dialog and a new row, and a click that appears to do nothing for
three seconds gets clicked again, but the honest unit of progress (entries) is not the one the
author perceives (bytes).

## Where the code goes

`src/storage/archive.ts` - UI-free, and the only file in the repo importing zip.js, so "does this
reach the player bundle?" is answerable by reading one import list. The picker and `AppShell` own
the input, the drop handler and the dialogs. It belongs under `src/storage/` because it needs
`projectStore`'s private knowledge of the `projects/<directory>/` layout, which a top-level
`src/archive/` would have to re-spell.

## Tests

**`test/unit/`** - everything the seam makes reachable without OPFS or a zip, over an in-memory
`AsyncIterable<ArchiveEntry>`: path rejection (`..`, absolute, backslash, drive letter, control
characters), both caps, the single-wrapping-directory strip, the manifest-missing /
unparseable / wrong-`formatVersion` / bad-id refusals, the missing-script refusal, and the
`README.txt` skip.

**`test/browser/`** - real OPFS and real zip.js: import an archive built in the test and assert the
tree; the overwrite path, including that the saves went; a hostile archive refused; and that a
crashed import (stop before step 4) leaves a directory the sweep removes.

**Name this suite's project directories after the suite.** `navigator.locks` is origin-wide and
knows nothing about scratch roots, and this ticket takes locks - `RecoverProjects` and
`RenameProject` sharing `old-name`/`new-name` produced a one-in-three flake that only appeared with
the whole browser project running. `CLAUDE.md` has the story.

## Comments

**Landed 2026-09-06**, on the same branch as 02 and 03, as the doc's hard constraint requires.
`src/storage/archive.ts` is the whole of it and the only file in the repo importing zip.js;
`test/unit/archive.test.ts` covers the back half over a listing and `test/browser/ImportProject.test.ts`
covers the writing, the overwrite, the picker surface and the crash.

**The seam is a listing rather than an `AsyncIterable`, and the ticket's own ordering is why.**
`ArchiveEntry` is `{ path, size, blob(): Promise<Blob> }` and `planImport` takes an array of them.
Two of the things step 0 has to settle **before a byte is written** cannot be asked of a one-pass
iterable without buffering the archive it exists to avoid buffering: what the whole thing sums to,
which is what makes the caps arithmetic rather than a race with the quota, and what the manifest says,
which this ticket asks to be read "by random access". Lazy bytes keep everything the seam was for - a
refused archive still inflates nothing at all, one entry is materialized at a time, and the whole back
half is reachable from `test/unit/` with no zip and no OPFS. `design-docs/PROJECT_STORAGE.md`'s
paragraph specifying the iterable is amended to match.

**The id gate turned out to be the manifest schema's, so there is no second check.** The ticket lists
"the id fails `validateProjectId`" as its own refusal; `parseManifest` validates `id` with that exact
schema, so a manifest that parses always names a directory the store can create. Adding a second call
would be a second copy of a filesystem-safety rule, which is what `validateProjectId`'s own comment
warns against. The refusal exists - it is reported as "its manifest.yaml does not parse", with the
parser's own message.

**The saves are dropped on every import, not only on an overwrite.** Step 2's `deleteSaveData(id)` is
one line broader than written, because a *fresh* directory can still collide with saves left under
that id by a published build of the same project played in this browser - the player writes to the
same `vn-save-<id>` keyspace - and that is the identical failure the ticket describes: a save whose
paths describe a story this project does not have, a replay that throws, and Load as a dead button.
The ticket's own reasoning for not keeping them ("indistinguishable at import time") applies unchanged
to that case.

**`created` is recorded only for a new directory, and `exported` is dropped whatever happened**, which
is the asymmetry the ticket sets out, implemented as `recordCreated` and `forgetExport` in the store.

**The file input is the Import button's sibling, not its child.** A click on a child input bubbles
back to the button, whose handler clicks the input: a loop with no bottom. Found by writing it the
other way first.

**The drag listeners are the first thing `ProjectPicker`'s `AbortController` genuinely carries.** They
are on the picker's root, which is the host's element and outlives every picker mounted into it - so a
superseded picker that kept them would answer drops over a project that had since opened. That
controller's comment said outright it was insurance until such a listener arrived; it has.

**Nothing says "imported" on success.** The row arriving is the confirmation, exactly as **Add demo
project** works - the banner is for refusals, and a green one would spend a status colour this chrome
means something else by.
