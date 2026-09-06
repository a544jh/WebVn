# 03: The exported date

Status: ready-for-agent

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
