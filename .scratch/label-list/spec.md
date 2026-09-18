# The label list

A second panel in the editor's right-hand column, listing every `label:` in the story with the line
it is on; clicking one takes the playhead there.

**Split out of `.scratch/asset-panel/` on 2026-09-12**, during that tranche's grilling. It shares the
column with the asset panel and nothing else: a different data source (`state.labels` rather than the
manifest), a different target buffer, a different refresh trigger, and no writes at all. It was in
the asset panel's tranche because it was in the same sentence when the column was first sketched, not
because the two are coupled.

**What the asset panel's tranche reserves for it**: the column is two stacked panels, with the asset
panel taking the remaining height, so landing this one changes a number rather than the layout. The
canvas draws it already, on the *Asset panel* page - those drawings are this spec's, and the note
beside them says so.

**Its specifics are not settled.** `issues/01-the-label-list.md` is written against today's
`goToLine` and names the one question it does not answer: `goToLine` honours the replay/direct radio,
and replaying to a label the current path cannot reach is meaningless. Beyond that sits `GoToLabel`
as a recorded `VnPath` action - a jump whose target survives an edit, where `GoToCommandDirect`'s raw
index silently means a different command after an insertion. Grill that before building either.
