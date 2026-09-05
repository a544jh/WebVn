import { takeProjectLock } from "./projectLock"
import {
  completeRename,
  deleteProject,
  isProject,
  listProjectDirectories,
  readEditorState,
  recordPendingRename,
} from "./projectStore"

// What makes a rename's blur trigger safe rather than merely convenient: blur never fires on a tab
// close, so this is not a backstop for a rare crash - it is the other half of the mechanism.
//
// **It runs immediately before the picker's list walk, on every render.** Not once per page load:
// the picker re-lists on every Back to projects, and an author can now enter and leave the editor
// repeatedly without a reload. Running before the walk is the only placement where the list never
// shows a row the sweep is about to remove.
//
// **Kept deliberately simple.** It is a no-op almost every time - no marker, no residue, nothing to
// do - so it is allowed to run and return. Nothing here caches its result, debounces it, or threads
// state between renders: this is a directory listing on a path that already does one, and the cost
// of it being wrong is an author's project.
export const recoverProjects = async (): Promise<void> => {
  await attempt(finishInterruptedRename)
  await attempt(sweepResidue)
}

// **Recovery must never stop the picker from drawing.** It is a best-effort tidy-up of a store that
// is already inconsistent, and the list is the author's only way back to their work - so a failure
// here leaves the marker standing and the next render tries again, exactly as a refused lock does.
//
// Measured 2026-09-05 by killing a tab inside a rename's post-commit window: Chromium was still
// holding the half-deleted source and threw `NoModificationAllowedError` out of `removeEntry`. That
// rejection travelled from here through `render` to the entry point's catch, and put "Something went
// wrong opening your project" on the page - over a perfectly good project sitting on disk, unlisted.
// The store being in a state recovery cannot fix is precisely when the author most needs the list.
const attempt = async (step: () => Promise<void>): Promise<void> => {
  try {
    await step()
  } catch (e) {
    console.warn("Could not finish tidying the project store - the library is listed anyway", e)
  }
}

// The marker is a **hint about where to look, and on its own it can never cause a delete**: every
// branch below re-verifies against the tree first. A marker that no longer describes anything is
// discarded rather than acted on.
//
// The destination's manifest is the rename's commit point, so its presence is the whole question:
// before it the destination is residue and the source is untouched, after it the destination is the
// project and the source is what is left over. There is no third state to guess about.
const finishInterruptedRename = async (): Promise<void> => {
  const { pendingRename } = await readEditorState()
  if (pendingRename === undefined) return
  const { from, to } = pendingRename

  if (!(await isProject(to))) {
    // The copy never committed. Nothing of the destination is worth keeping and nothing of the
    // source was touched - so the marker goes, and the sweep below removes the half-copy under its
    // own lock rather than this doing it a second way.
    await recordPendingRename(null)
    return
  }

  // Committed, so the delete is what did not finish - or did, and only the bookkeeping was left.
  // Both are the same three steps, and every one of them is safe to repeat.
  //
  // **The lock is taken on what is about to be deleted.** Between the commit and the delete both the
  // source and the destination are valid, listed projects, so a second tab can legitimately have
  // opened the source before this one reached the picker; deleting it would take a project out from
  // under a live editor. This tab holds nothing of its own here - recovery runs before any project
  // is chosen - so the lock is purely to guard the delete.
  const lock = await takeProjectLock(from)
  // Left for the next render, which - running on every picker render rather than once a session - is
  // soon rather than next time the author opens the app.
  if (lock === null) return
  try {
    await completeRename(from, to)
  } finally {
    await lock.release()
  }
}

// A directory with no `manifest.yaml` is not a project - it is the residue a crashed rename or,
// later, a crashed import leaves. `listProjects` already skips one, so until now it was invisible
// and still occupying quota.
//
// **Nothing races this.** `createProject` writes the manifest first, so a project being made by
// another tab never presents as manifest-less. That ordering is load-bearing in a second place now,
// and the import path has to respect the same rule: manifest last for a copy that must not commit
// early, manifest first for a create that must not look like garbage.
//
// What is deliberately *not* swept is a directory holding a manifest but no `script.yaml`. Without
// the marker that is the most this could infer, and inferring it would be wrong: it is exactly the
// state `createProject` passes through between its two writes. A duplicate project the author can
// delete is the price of never making a wrong one, which is the invariant the whole ordering exists
// to buy.
const sweepResidue = async (): Promise<void> => {
  for (const directory of await listProjectDirectories()) {
    if (await isProject(directory)) continue

    // A rename in flight in another tab holds its destination's lock, and that destination is
    // manifest-less right up until it commits - so without this, one tab reaching its picker would
    // delete another tab's half-finished copy out from under it.
    const lock = await takeProjectLock(directory)
    if (lock === null) continue
    try {
      // No bookkeeping to forget with it: `created` is written by `createProject`, which has already
      // written a manifest by the time it gets there, so residue never has an entry.
      await deleteProject(directory)
    } catch (e) {
      // Per directory, so one the browser will not let go of does not cost the sweep the rest.
      console.warn(`Could not remove ${directory}, which is not a project`, e)
    } finally {
      await lock.release()
    }
  }
}
