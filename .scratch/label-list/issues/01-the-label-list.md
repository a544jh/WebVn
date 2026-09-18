# 01: The label list

Status: ready-for-agent

Blocked by: `.scratch/asset-panel/issues/01-the-asset-panel.md`, for the column it sits in - that
ticket builds the column as two stacked panels with the asset panel taking the remaining height, so
this one fills a space that is already there.

## What to build

A second panel under the assets one, listing every `label:` in the story with the line it is on.
Clicking one takes the playhead there. Drawn on all four artboards.

## Most of this already exists

`state.labels` is `Record<string, number>` - name to command index - rebuilt by `updateLabels` on
every parse. A command carries its `SourceLocation`, so a label's line is
`commands[index].getSourceLocation().startLine`.

`VnEditor.goToLine(line)` already does the rest, including the part that is not obvious: when the
script buffer is dirty it reloads the story first and truncates the path to what still replays,
because a path describing the old script would be waiting to break the next undo. Today only a
gutter click reaches it.

**So the whole ticket is a list and one new public method.** `goToLabel(name)` on `VnEditor`:
resolve the name through `this.player.state.labels`, turn the index into a line, call the private
`goToLine`. Keep the resolution inside `VnEditor` rather than having the panel compute a line - the
panel should name a label, not a position, and `state.labels` is the map that turns one into the
other.

## When it redraws

`renderer.onRenderCallbacks`, which is what `wireDebugPanel` already uses for the same shape of
problem. Two things change under it and both arrive on a render: the set of labels (on a reparse)
and which one the playhead is inside (on every move).

Not `onManifestAdoptedCallbacks` - that is ticket 01's trigger and labels have nothing to do with
the manifest.

## The current label

The last label at or before `state.commandIndex`. Marked with **a rule and weight over a quiet
fill**, and the rule is `--vn-editor-marker-position` - the playhead's own blue, the same the script
gutter paints on the same line. It is one fact, so it should not be stated in a second vocabulary,
and none of the three status colours is spent on it.

Before the first label there is no current label and nothing is marked. That is a real state - a
story whose first label is at line 31 spends its opening in it - and not an error.

## What the list is, and is not

**It is as fresh as the last parse.** It says what the preview is running, not what the buffer says.
An author who types a new `label:` does not see it until the script is reparsed, which is the same
contract `setPositionMarker` already has, and stating it here is what stops someone "fixing" it with
a parse per keystroke.

Empty state: `This script has no labels.` - centred and muted, the `.vn-picker-empty` treatment. A
short story with no labels is completely ordinary, so this is a statement and not a warning.

## The jump mode question, which is NOT settled here

`goToLine` honours the replay/direct radio, so a label click inherits it. Replaying to a label the
current path cannot reach is meaningless - the replay walks from the top answering recorded
decisions and stops where they run out, which for an unreachable label is somewhere that is not it.

**This ticket does not change that.** It ships the list against today's behaviour. The follow-up is
a `GoToLabel` action recorded on `VnPath`: a label is the only jump target that survives an edit,
where `GoToCommandDirect`'s raw index silently means a different command after an insertion. That is
a `core/` change with its own blast radius - `VnPath`, `PathStep`, `getReplayableDecisions`,
`goToCommandByReplay` - and it wants its own ticket outside this tranche.

Recorded here so the next reader can tell this was decided rather than overlooked.

## One dependency worth knowing about

`updateLabels` throws a bare `Error("Label x already exists in story.")` on a duplicate label
(`Label.ts:33`). A list keyed on `state.labels` is only as reliable as that map, and
`SCRIPT_INCLUDES.md` already prescribes turning the throw into a returned `ParserError` and calls it
*"worth doing now regardless of whether any of this is built"*. Not a blocker - a duplicate label
takes the whole parse down today, so the list is never asked to draw one - but the fix belongs
before anything else leans on that map.

## Tests

`test/browser/`, through `startEditor`:

- a script with three labels lists all three with their lines
- clicking one moves the playhead, and the position marker follows
- the label the playhead is inside is the marked one, and it changes as the story advances
- a script with no labels shows the empty state
- a reparse that adds a label adds a row
