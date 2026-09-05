# 01: The rename suite flakes when the browser files run in parallel

Status: ready-for-human

Blocked by: nothing.

`test/browser/RenameProject.test.ts` fails intermittently under `npm test`, and it fails on `master`
as well as on any branch - it is not a feature's fault. One rename throws `NotFoundError` partway,
and then every later test in that file times out on "the story to be loaded", because the store and
the locks are left mid-flight. Which test trips first moves with the timing, so the failure list is
never the same twice; that is one bug, not six.

Two of its three known causes are fixed (below). The rest is open, and this ticket exists so the
next attempt starts from the evidence rather than from the beginning.

## Reproduce it

```
for i in $(seq 1 25); do
  npx vitest run --project browser > /tmp/run$i.log 2>&1
  grep -q "failed partway" /tmp/run$i.log && echo "run $i REPRODUCED"
done
```

Roughly **one run in eleven** as of this writing, down from one in three before the two fixes. It
needs the whole browser project: `npx vitest run --project browser RenameProject` alone passed 3/3
and has never been seen to fail.

**With `--no-file-parallelism` it does not reproduce at all** - 6/6 clean. That is the single most
useful fact here: the failure needs two suites running at once.

## Why the suites can collide at all

Vitest browser mode runs **one Chromium instance, one origin**, a file per iframe, several at once
(`vitest.config.ts` sets no `fileParallelism`, so it takes the default). Every isolation mechanism
the storage layer has is per-origin:

| Resource | Isolated by | Was it? |
| --- | --- | --- |
| OPFS | per-suite scratch directory + `setStoreRoot` (`test/helpers/opfs.ts`) | yes |
| `navigator.locks` | nothing - the lock name is `vn-project-<directory>` | **no** - fixed, see below |
| `localStorage` | nothing - the key is `vn-save-<id>` | **no** - fixed, see below |

`test/helpers/opfs.ts` already warns about this shape for OPFS: three suites shared one scratch name
until 2026-09-05 and "passed anyway, which is the whole problem", because their `beforeEach` calls
interleave milliseconds apart. The other two globals had the same hole and no such warning.

## Fixed

- **Lock names.** `RecoverProjects` and `RenameProject` both used `old-name`/`new-name`. A scratch
  root keeps their files apart and does nothing about locks, so both contended for one
  `vn-project-old-name` while their trees sat in different directories - and both take locks on
  exactly those directories, one driving the recovery sweep and the other booting and renaming them.
  Names are suite-specific now.
- **`localStorage.clear()`.** `createVnRoot` and two `mountPage`s wiped the whole origin's saves,
  taking out the save data of whatever file was mid-test beside them. Scoped to the ids a suite owns,
  through `deleteSaveData` so the key format is not spelled a second time.

Together these took the rate from ~33% to ~9%. Both are correct independent of what remains.

## Ruled out

Each of these was tested, not merely considered:

- **A repointed store root.** The theory was that `setStoreRoot`'s module state is shared across
  iframes, so a neighbour's `clearOpfsStore` would point this suite at the wrong tree. **Disproved**:
  at the moment of failure `listProjectDirectories()` returns `["rename-old-name"]` under root
  `test-scratch-rename`, which is this suite's own. The store is looking in the right place.
- **The directory being gone.** Same evidence - it is listed. What fails is `projectSize` *walking*
  it, so a file inside it vanished between enumeration and read.
- **A stale `.stack` telling us where.** Async OPFS `DOMException`s arrive with `stack: undefined`.
  Do not spend a probe on this again.
- **`recoverProjects` sweeping a live project.** `sweepResidue` takes the project's lock before
  deleting and the session holds that lock throughout `roomProblem`, so it cannot be the direct
  cause here. See the loose end below, though.

## Where it fails, exactly

`AppShell.rename` -> `roomProblem(from)` -> `projectSize(from)` -> `walk`. Confirmed by labelling
each of the rename's five awaits. Not the copy, not the boot: the size walk, which is the first thing
the rename touches after the author confirms.

One captured timeline, from logging every `removeRecursive` with a timestamp and root:

```
t=027153  root=test-scratch-rename  path=projects/rename-new-name
t=027179  root=test-scratch-rename  path=projects/rename-old-name
t=027211  root=<opfs root>          path=test-scratch-rename      <- a beforeEach clearing the tree
t=027332  projectSize FAILED        dir=rename-old-name
```

Read it carefully, because it was misread once: the first two are a *complete* rename (destination
deleted, then source deleted 26ms later), not an interrupted one. Then the scratch tree goes, and
121ms after that a `projectSize` walks into the hole. So the failing walk belongs to work that
outlived the test that started it - but which work, and started by which test, is not established.

## Tried and did not fix it

- **Draining before teardown.** `AppShell.settled()` returns the tail of the swap queue, and both
  shell suites' `afterEach` awaits it before closing. The reasoning: a rename keeps working after the
  test returns, since the test only waits for the part it asserts on. **It did not move the rate** -
  5 failures in 37 runs after, against 4 in 46 before, which is noise in both directions rather than
  an improvement or a regression. It is kept because draining queued async work before deleting the
  tree it operates on is correct ordering on its own terms, not because it fixes this.
- **A 50ms `settle()` in `afterEach`**, tried before the above. Too short to mean anything against a
  121ms gap; the negative result was the probe's fault, not the theory's.

## Loose ends worth a look

- **`exists()` turns every failure into `false`** (`src/storage/opfs.ts`). `recoverProjects` deletes
  a directory on the strength of `isProject` being false, and `isProject` is `exists`. So a
  *transient* failure reading `manifest.yaml` - not an absent one - authorises a delete. Nothing has
  shown this firing, and the lock ordering above argues against it, but it is a sharp edge in the
  recovery path and it is the only mechanism found so far that deletes a live project's files.
- **`ProjectStoring`'s 2000ms debounce** outlives any test that types and does not wait it out. A
  close flushes it, but only for a session the test still holds.
- **`ProjectPicker.test.ts` logs seven `Could not seed assets/... into the demo project`** on every
  run and passes anyway. Unrelated to this as far as anyone has checked, but nobody has checked.

## What not to do yet

**`--retry=1` on the browser job** is the ladder `CLAUDE.md` already prescribes for a flaky browser
suite, and it is deliberately **not** taken: with the rate at ~9% a retry would hide this rather than
record it, and the two fixes above landed precisely because the failure stayed visible. Take it if
the flake starts costing more than it teaches.

**`fileParallelism: false`** makes it go away completely and costs the fast gate 13.5s -> 59s on this
project. Serializing only the storage-heavy suites is the middle option, but that is most of the
browser files, so most of the cost.

## Comments

Found 2026-09-05 while getting CI green for the `?project=` work (PR #42), which is where the two
fixes and `settled()` landed. The hunt ran to eight probes; the three causes above were each wrong
before they were right, so the "ruled out" list is the most valuable part of this file.
