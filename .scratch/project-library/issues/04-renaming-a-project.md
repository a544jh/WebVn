# 04: Renaming a project

Status: ready-for-agent

Blocked by: 01 (closing a project and opening another), 03 (new projects, and deleting one - for the
dialog surface).

## What to build

Changing `id:` in the manifest buffer renames the project: the directory it is filed under follows the
identity it declares. Today the two silently disagree - the store keeps writing to the old directory,
because every read, write, store and lock addresses the directory and nothing rewrites an id to match
one. The design doc is explicit that the fix runs in this direction and only this one: **when the
directory and the manifest disagree, the directory moves.**

## The trigger

Manifest blur, when the id differs from the directory. That rides the adoption that already happens
there - blur is when the manifest is parsed, taken as the one the project runs under, and the script
reparsed against it - so the id change is noticed on the same event rather than needing a new one.

Blur is a rough trigger: it fires on incidental focus changes, and it never fires on a tab close.
That is survivable only because ticket 05's startup reconcile catches whatever it misses. Do not
refine the trigger here - the doc files that as a UI question, and it is open.

Declining reverts the `id:` field alone and keeps every other edit in the buffer.

## The ordering, which is the whole ticket

0. If the destination id already names a project: confirm the overwrite explicitly, then recursively
   delete it - **before** the marker is written, so "a directory with no manifest is garbage" holds
   throughout and the destructive step is up front rather than interleaved with the copy. This is the
   same confirmation an import that collides with an existing id will get, because it is the same
   operation.
1. Record `pendingRename: { from, to }` in `editor.yaml`. A single slot, not a per-project field:
   one project is open at a time under the lock, so two renames cannot overlap and "is a rename in
   flight" is one check at startup rather than a scan.
2. Copy `script.yaml` and `assets/` into `projects/<new-id>/`, **manifest last**.
3. Write `projects/<new-id>/manifest.yaml` with the new id. This single atomic file write is the
   commit point - an OPFS write is already atomic, so nothing needs layering on top of it.
4. Recursively delete `projects/<old-id>/`, then clear `pendingRename`.

Ticket 05 is what reads that marker. Write it here anyway and in this order, because the ordering is
what makes every crash state recoverable and it is not worth building twice.

## Quota, not time

The old tree survives until the new one is complete, so a rename needs **2x the project size free**
and dies halfway with `QuotaExceededError` if it is not there. Check `navigator.storage.estimate()`
up front and refuse with a clear message rather than failing partway. `persist()` does not help with
this - that is eviction, not quota, and it belongs to ticket 06.

The check comes before the overwrite delete, which is what keeps the residual "destination deleted,
then the copy fails" window as small as it can be.

## The copy

A recursive copy helper over the walk the filesystem layer already yields, streaming each file
(`blob.stream().pipeTo(writable)`) so memory stays bounded whatever the project holds. Export and
import share this helper later - one walk, three callers - which is why it is written as a helper
rather than inline here.

**No feature-detected fast path.** `FileSystemHandle.move()` is not in the WHATWG FS spec at all, and
Chrome exposes it on file handles only, never on directory handles. A second code path for engines
that might one day have directory move is not worth maintaining for an operation this rare.

## Afterwards

The session is addressed by a directory that no longer exists - the storer, the resolver and the lock
all hold the old one - so the rename ends by closing and reopening under the new directory, through
ticket 02's switch. `lastOpened` follows.

## Saves are orphaned, deliberately

The player's save key is `vn-save-<id>`, so a rename orphans the old one and nothing migrates it. Say
so in the dialog. This is not an oversight to paper over: nothing local can reach the saves of people
playing an already-published build, so the orphaning is unavoidable there regardless, and a rename
and a save-break are the same gesture on purpose.

There is no "keep the old id as a copy" option. Duplicating a project is its own action in the
library, not a checkbox here: it would double the storage cost of a rename under exactly the quota
pressure the check above exists for, and leave behind a project the author did not ask to create.

## Acceptance criteria

- [ ] Editing `id:` and blurring raises the dialog, naming both ids and saying that saves under the
      old one are orphaned
- [ ] Confirming leaves exactly one project, under the new directory, with the script, the manifest
      and every asset intact
- [ ] The editor reopens on the renamed project, with the storer, the resolver and the lock all
      addressing the new directory
- [ ] Declining reverts `id:` alone; every other edit in the manifest buffer survives and adopts
      normally
- [ ] A rename that would not fit is refused up front with a message, and nothing is copied or
      deleted
- [ ] A destination that already names a project raises an explicit overwrite confirmation; declining
      it leaves both projects untouched
- [ ] Confirming an overwrite deletes the destination before the marker is written
- [ ] The destination has no `manifest.yaml` until the copy is otherwise complete - asserted, since
      every recovery state in ticket 05 turns on it
- [ ] `pendingRename` is written before the copy and cleared after the delete
- [ ] The copy is one recursive helper over the existing walk, streaming per file

## Not in scope

- **Recovery.** Ticket 05 reads the marker this one writes. Shipping in this order is survivable:
  `listProjects` already skips a directory with no manifest, so a crashed rename is an invisible
  orphan occupying quota rather than a broken library.
- **Refining the blur trigger.** Open question in the design doc, and ticket 05 is what makes blur
  safe rather than correct.
- **Warning harder once a project has been exported.** Also open, and there is nothing to export yet.
