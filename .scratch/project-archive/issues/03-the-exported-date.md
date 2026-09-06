# 03: The exported date

Status: done

Blocked by: 02 (exporting a project). There is nothing to date until an export exists - which is
exactly why tranche 2 refused to build this field then. See `.scratch/project-library/spec.md`: *"A
date field nothing ever writes is the 'field nobody can tell is dead' that
`.scratch/project-storage/issues/04-project-store.md` refuses on `editor.yaml`."*

## What to build

Every picker row says when the project was last exported, or that it never has been.

## The field

`exported`, in `editor.yaml`, **a map keyed by directory** - the same shape as `created` and
`lastOpened`, and for the same reason: the picker draws a line against every row and one name can
only speak for one of them.

```yaml
exported:
  cat-adventure: 2026-09-06T11:02:31.000Z
```

Written by **both** export surfaces - the picker's row control and the editor's Export ZIP button -
which is one reason the write belongs next to where the archive is built rather than in either
caller. An author who exports from inside the editor and then goes back to the library must find the
row already saying so.

Written when the blob is handed to the download anchor. That is not proof the author saved the file
- a download can be cancelled - and there is no event that is. Recording the attempt is the honest
approximation, and the failure mode is mild in the direction that matters: a row that says "exported
today" when the save was cancelled is wrong, but a row that says "never exported" would be worse
advice than the truth in every other case.

Merge it into whatever else the file holds, like every other write to it. `forgetProject` learned
that the hard way - spelling out two maps and leaving the rest behind dropped `pendingRename` on the
floor and turned an interrupted rename's source into a permanent duplicate.

## The three places it has to move with the project

An entry that outlives the project it describes is inherited by the next project to claim that
directory - which is precisely the trap `forgetProject` exists for, arriving through a third door.

1. **A rename carries it.** `moveProjectRecords` moves `created` and `lastOpened`; add `exported`.
   Without it a renamed project reads as never exported, and the author is told to make a backup
   they already have.
2. **A delete drops it.** `forgetProject`.
3. **An overwriting import drops it.** Ticket 01, step 2: the date described the project that was
   just destroyed, not the one that replaced it. This is the same reasoning as
   `deleteSaveData(id)` in that step, and the two belong together in the code.

## On the row

"exported 3 days ago" beside the existing "opened 2 days ago", using the same relative formatter
(`openedLabel` and its `parseDate` in `ProjectPicker.ts`; generalize rather than copy).

A project with no entry says **"never exported"**. That is deliberately a statement and not a
warning: no colour, no icon, no badge. The status colours are not decoration - green means stored,
orange means "needs attention and the work still runs", red means "did not parse, or a write
failed" - and spending orange on this would cost that meaning, which `design.md` says outright.

## No nag

The design doc wants one, and this is where it would go. It is not built.

"Never exported" on the row is most of the nag's value, in the place the author is already looking,
and at no interaction cost. A nag proper needs a staleness threshold nobody has evidence for, and
the doc's strongest argument for it - Twine's decade of support threads from authors who lost a
whole library to cleared browser data - is already partly answered by the `persist()` tranche 2
landed, which exempts the origin from pressure-based eviction.

Recorded here rather than left silent so that the next reader can tell this was decided rather than
forgotten.

## Tests

`test/browser/`, with the picker: a row before and after an export; the date surviving a rename; the
date gone after a delete and after an overwriting import.

## Comments

**Landed 2026-09-06**, with 01 and 02. `exported` is a third map in `editor.yaml` beside `created` and
`lastOpened`, written by `recordExported` inside `exportProject` - so both surfaces date a project
without either caller remembering to.

**All three ways it moves are covered.** `moveProjectRecords` carries it across a rename (and the loop
there is now one pass over the three maps rather than two spelled-out fields, which is what stops the
fourth being forgotten); `forgetProject` drops it on a delete; and an import drops it through
`forgetExport`, beside the `deleteSaveData` call it belongs with. `test/browser/ExportProject.test.ts`
asserts the first two and `ImportProject.test.ts` the third.

**The row's line is one line, with the fact after a middle dot**, as the canvas draws it - and
`openedLabel` was generalized into `agoLabel(verb, at)` rather than copied, so the two halves cannot
drift. A project whose manifest does not parse says nothing about exporting at all: it cannot be
exported, its red line says so, and "never exported" under that would read as a second complaint.

**No nag, and no colour**, exactly as specified. The statement sits in the muted line the row already
had.