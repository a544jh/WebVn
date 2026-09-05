# 05: Recovering a crashed rename, and sweeping garbage

Status: done

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

## Comments

**Landed 2026-09-05**, on `claude/project-library`, completing the tranche. `src/storage/
recoverProjects.ts` is the whole of it, called by `ProjectPicker.render` before its list walk.
Covered by `test/browser/RecoverProjects.test.ts` - twelve crash states built directly in the store
and rendered over, which is the only way to hold one still, since a real rename passes through each
in milliseconds. Also driven by hand: a demo copied to a second directory with the marker left
behind and some residue beside it, then reloaded, leaving one directory of three.

**The commit point does all the deciding.** The destination's manifest is what a rename's ordering
exists to make meaningful, and recovery needs exactly one question: is the destination a project? If
not, the copy never committed - the marker goes and the sweep takes the half-copy. If so, the tail of
the rename is what did not finish, and `completeRename` runs it. That tail is a **shared function**
rather than a second implementation: what a crashed rename becomes is what an uninterrupted one would
have been, and every step of it is safe to repeat, so it can run over a rename that got further than
the marker suggests.

**The bookkeeping had to be part of it**, which the ticket does not mention. A crash between the
commit and `moveProjectRecords` leaves `created` filed under the old directory, and the recovered
project would land in the undated bucket the picker sorts first - so a crash would silently move a
project to the top of the library. Sharing the tail is what fixes that for free.

**Two things the ticket says are checked, and one it says that is not acted on.** The locks are real:
removing either one fails a test - the source lock, because between commit and delete a second tab
can legitimately have the source open, and the sweep's, because a rename in flight in another tab
holds a destination that is manifest-less right up until it commits. What is *not* acted on is
"a manifest with no `script.yaml` means incomplete". It is true and it is the most enumeration alone
can infer, but deleting on it would be a wrong delete: that is precisely the state `createProject`
passes through between its two writes. A duplicate the author can remove is the price of never
making a wrong one, which is the invariant the whole ordering buys.

**One of my own tests was vacuous and was rewritten.** "Sweeps before the list is drawn" passed with
recovery moved *after* the walk, because `listProjects` skips a manifest-less directory whenever the
sweep runs - residue can never demonstrate that ordering. What can is a rename that committed and did
not finish: both directories are valid, listed projects at that moment, and recovery removes one. The
test now asserts one row rather than two, and was confirmed to fail with the call moved after the
walk.

## Comments: hand verification, and what it found

**Asked 2026-09-05: can this ticket even be hand-verified?** Mostly not, and the first attempt at it
was not verification at all - it fabricated the crash state through `page.evaluate` and then looked,
which is what `RecoverProjects.test.ts` already does, run through a browser. Worth recording so
nobody takes that kind of check for evidence again.

It *can* be done properly, and the trick is to widen the windows rather than to fabricate. A demo
padded to 1500 files renames in phases wide enough to interrupt with a hard navigation:

```
     0ms  source only
   496ms  marker written
   501ms  destination appears, copy begins
  7112ms  destination's manifest written   <- the commit
  7355ms  source deleted                   <- a 243ms window
  7359ms  marker cleared
```

Killing the page in the copy window and in the post-commit window are both reachable - the second by
polling for the destination's manifest from the test runner and navigating away the moment it lands.
Both states are then produced by the real rename code rather than written by hand.

**And the post-commit interruption immediately found a bug the twelve fabricated states could not.**
They all build a *clean* crash; a browser interrupted mid-delete is still holding the tree it was
deleting, and Chromium throws `NoModificationAllowedError` out of `removeEntry`. That rejection
travelled from `recoverProjects` through `ProjectPicker.render` and `AppShell.showPicker` to the
entry point's catch, and put **"Something went wrong opening your project" on the page over a
perfectly good project sitting on disk, unlisted**. The one moment the author most needs the list is
the moment the store is in a state recovery cannot fix.

Recovery is now wrapped so it can never stop the picker drawing, and the sweep catches per directory
so one the browser will not let go of does not cost it the rest. A failure leaves the marker standing
and the next render tries again - the same behaviour a refused lock already had. Re-run against the
real interruption, it converges: first reload lists the library with the marker still up, second
reload clears it.

`Never a wrong delete` was the invariant this ticket was written around. What it did not say, and
what only a real crash showed, is that **recovery failing must not cost the author their library
either**.

