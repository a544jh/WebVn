# 06: What a project costs, and asking not to be evicted

Status: ready-for-agent

Blocked by: 02 (the project library).

## What to build

The library says how much room each project takes, and the origin asks not to be evicted. The project
is the unit people actually lose, so it is the unit the figure is attached to.

## Per-project size

Summed from the sizes the walk already yields. `WalkedFile` carries a `size` for exactly this reason
- `getFile()` is already in hand there, and it was put in rather than left to a second walk later.

**Not `navigator.storage.estimate()`**, which is origin-wide and cannot answer a per-project question
at all. It is worth writing down because reaching for it is the obvious move and it is wrong, and the
walk is already there.

The figure counts assets, not just the two buffers, which is the entire point: a project is small
until someone drops a 12MP phone photo in as a background.

## persist()

Call `navigator.storage.persist()` on the first store, which exempts the origin from pressure-based
eviction. It is a request rather than a guarantee - Chrome grants it silently on engagement
heuristics, Firefox prompts - so report what it answered rather than assuming it succeeded, and show
`navigator.storage.persisted()` in the library.

Note what it does *not* do: persistence is about eviction, and quota is a separate limit. Ticket 04's
rename check is the quota one, and neither substitutes for the other.

## What is deliberately missing: the nag

The design doc wants a **"last exported" date** beside the size, and the export nagging that hangs off
it. Both are held back to tranche 3, because there is nothing to export yet: the `?vn=` payload
carries the manifest and the script and no assets, and `CONTEXT.md` reserves *export* for the archive
that carries them. A date field that nothing ever writes is the "field nobody can tell is dead" that
the store already refuses on `editor.yaml`.

It lands beside zip export, under that effort's own hard constraint - an export that nothing can read
back is not a safety net, so export must not ship ahead of zip import. Leave a line saying so where
the field will go, and no field.

## Acceptance criteria

- [ ] Each project in the library shows its size, summed from the existing walk, with no second
      traversal of the tree
- [ ] The figure includes assets, not only `manifest.yaml` and `script.yaml`
- [ ] `persist()` is called once, on the first store, and what it answered is reported rather than
      assumed
- [ ] The library says whether storage is persisted
- [ ] No "last exported" field is added, and the reason is recorded where it would go

## Not in scope

- **The export nag.** Above, and in this tranche's spec.
- **Anything about quota during a rename.** Ticket 04 owns that check, and it is a different limit
  from the one `persist()` addresses.
