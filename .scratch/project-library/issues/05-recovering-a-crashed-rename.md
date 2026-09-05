# 05: Recovering a crashed rename, and sweeping garbage

Status: ready-for-agent

Blocked by: 04 (renaming a project).

## What to build

Reaching the picker after a tab was killed mid-rename leaves exactly one valid project, whichever
moment it died in. This is what makes ticket 04's blur trigger safe rather than merely convenient:
blur never fires on a tab close, so the reconcile is not a backstop for a rare crash, it is the other
half of the mechanism.

## Recovery, and the rule it obeys

**Recovery runs immediately before the picker's list walk, on every picker render** - not once per
page load. It **re-verifies against the tree before acting**, and the marker can never by itself cause
a delete.

"Startup" was this ticket's original word, written when a boot mounted an editor and so startup,
choosing a directory and taking a lock were one event. They are three now, and the picker re-lists on
every Back to projects. Running before the walk is the only placement where the list never shows a row
the sweep is about to remove; running on every render rather than once a page is what keeps the safety
net under 04's blur trigger as tight as it was, since an author can now enter and leave the editor
repeatedly without a reload.

**Keep it simple.** It is a no-op almost every time - no marker, no orphan directory, nothing to do -
so let it run and return. Do not cache its result, debounce it, or thread state between renders: this
is a directory listing on a path that already does one, and the cost of it being wrong is an author's
project.

- `pendingRename` present, destination has no `manifest.yaml`: the copy never committed. Sweep the
  destination; the source is untouched and opens normally.
- `pendingRename` present, destination is a valid project: the copy committed, and step 4 is what did
  not finish. Delete the source and clear the marker.
- `pendingRename` naming a source or destination the tree does not bear out: discard the marker. It
  is a hint, and a hint that no longer describes anything is not evidence for a delete.

**Take the lock on what is about to be deleted.** Between the commit and the delete, both the source
and the destination are valid, listed projects, so a second tab can legitimately have opened the
source before this one reaches the picker. Deleting a directory another tab holds would take the
author's project out from under a live editor. If the lock is refused, leave the marker and do
nothing: the next render with nobody holding it finishes the job - which, running on every picker
render, is soon rather than next session.

Note this tab holds nothing of its own at that moment: recovery runs before any project is chosen, so
the lock it takes is purely to guard the delete. That is the same shape ticket 03's delete uses, and
03 says to take this policy rather than invent a second one.

## The sweep

A directory with no `manifest.yaml` is not a project - it is the residue a crashed rename or, later,
a crashed import leaves. `listProjects` already skips one, so today it is invisible and still
occupying quota. The sweep deletes it.

Nothing races this: `createProject` writes the manifest first, so a project being made by another tab
never presents as manifest-less. That ordering is now load-bearing in a second place, and the import
path in tranche 3 has to respect the same rule - manifest last for a copy that must not commit early,
manifest first for a create that must not look like garbage.

## Losing editor.yaml

`editor.yaml` has no schema version and is defined as losable - a missing or unparseable one reads as
empty. Recovery therefore has to degrade to what enumeration alone can prove: no manifest means
garbage, and a manifest with no `script.yaml` means incomplete. That covers everything except a
fully-copied-but-partial asset tree, and leaves at worst a duplicate project for the author to
delete. **Never a wrong delete** - which is the invariant the whole ordering exists to buy, holding
even for the one field that cannot be rebuilt from the tree.

## Acceptance criteria

Crash states are built directly in the store and then booted over.

- [ ] Crash before the manifest is written: the destination is swept, and the source is listed on the
      picker with everything intact and opens normally when chosen
- [ ] Crash after the manifest is written, before the delete: the source is deleted, the marker is
      cleared, and one project remains under the new id
- [ ] A marker naming a destination that does not exist is discarded, and nothing is deleted
- [ ] A marker naming a source that does not exist is discarded, and the destination is left alone
- [ ] Recovery does not delete a directory another tab holds the lock on; the marker survives for the
      next picker render
- [ ] A directory with no `manifest.yaml` is swept before the list is drawn, whether or not a marker
      mentions it
- [ ] Recovery runs again on a Back to projects, not only on a page load
- [ ] A directory holding a manifest that does not parse is **not** swept - that is an author's
      project with a typo in it, and it stays listed and openable
- [ ] With `editor.yaml` missing or unparseable, the picker still lists a consistent set: garbage
      swept, at worst a duplicate project, never a wrong delete

## Not in scope

- **A user-visible report of what recovery did.** Its outcomes are "one valid project" either way,
  and if a duplicate is left behind the picker lists two, which is the honest thing and needs no extra
  surface. The original justification here - that it runs before the editor is on screen - no longer
  says anything: the picker is what it runs before, and that is a screen. What replaces it is that
  recovery is a listing on a path that is already doing one, so there is nothing for the author to
  wait through and nothing to report.
- **Repairing a partial asset tree.** Undetectable without something that says what should be there,
  and the doc accounts for it as the one gap that leaves a duplicate rather than a loss.
