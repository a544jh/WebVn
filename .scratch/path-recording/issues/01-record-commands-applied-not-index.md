# Record what `advance` applied, not where the playhead landed

Status: ready-for-agent

`VnPlayer.playheadMoved` asks "did `commandIndex` end somewhere else?" as a stand-in for "did this
advance do anything worth recording?". A loop returns to the index it left having run every command
in it, so the proxy answers no and the trip goes unrecorded. Count the commands `State.advance`
actually applies and have both the recorder and `Advance.tryPerform` read that instead. Filed
2026-08-29 out of the scroll-wheel crash work (`claude/end-of-story-path-steps`, `85ad11b`).

Unlike the other two things filed that day, **this one is reachable from the UI** - see below.

## The symptom

Skip mode or the scroll wheel, in a story that loops:

```yaml
story:
  - label: loop
  - "a line"
  - jump: loop
```

Parked on the line, the playhead is at 2 and the next command is the `jump`. Measured:

```
at stop      idx 2   path []
after skip   idx 2   path []      <- the whole loop ran; nothing recorded
after click  idx 0   path [1>]    <- recorded
```

The trip is not in the path, so `undo` steps over it as if it never happened - it undoes whatever
came before instead. A click is unaffected because `advance` takes a *single* step and that step is
the `jump`, which lands on a different index before the automatic run walks back.

**Reachable from the second lap onward.** `skipToNextStop` and the wheel both gate on
`isNextCommandSeen`, which needs the `jump`'s index marked seen - and going round once marks it. No
edited script, no direct API call. `src/demoStory.ts` ends in `jump: loop` and has a second on the
good branch, so the demo story itself is one of these.

## Why the index is there at all

It replaced object identity, which was worse. `State.advance` hands back a *fresh* snapshot even at
the end of a story - it rebuilds one, clearing the frame's transition and sfx flags, before finding
there is no command left - so `newState !== state` read as movement where there was none, recorded
actions no replay could walk, and the next `undo` threw
`"Could not replay action - path does not match the story"` out of `VnAction.perform`.

The index fixed that and bought a real property: `Advance.tryPerform` uses the same test, so
recording and replay answer one question and cannot drift. **Keep that property.** What is wrong is
the question, not the sharing of it. Losing an action is also strictly better than the crash, which
is why this is filed rather than urgent.

## The fix

`State.advance` has exactly two paths where it applies no command:

```ts
if (state.decision !== null) return state                  // a decision is pending
...
if (newState.commandIndex < newState.commands.length) {    // false past the end
  newState.seenCommands.add(newState.commandIndex)
  newState = newState.commands[newState.commandIndex].apply(newState)
}
```

Add `readonly commandsApplied: number` to `VnPlayerState`, incremented inside that guard, seeded to
`0` by `seedState`. Then:

- `VnPlayer.playheadMoved` becomes a comparison of `commandsApplied` (and wants a name to match -
  `didAnything`, or fold it back into the two call sites).
- `Advance.tryPerform`'s `if (next.commandIndex === before) break` becomes the same comparison.

Both then read one signal, produced by the code that actually applies commands. Whatever future
reason `advance` grows for doing nothing, neither site has to learn about it.

## Alternatives, and why not

- **Return the input state unchanged when `advance` applies nothing**, so identity works again. At
  the end of a story `advance` *also* clears the frame's `shouldTransition` and `sfx`, so returning
  the input leaves a finished sound effect armed to replay on the next render. Splitting "clear the
  frame" from "run a command" is a bigger change than the counter, and worth considering only if
  that split is wanted for its own sake.
- **Spell the conditions out at both sites** ("record unless the story is over and no decision is
  pending"). That is exactly the shape that caused the original crash: one rule in two places, free
  to drift.

## Watch out for

- Nothing persists a state, so the save format is untouched - saves store paths. But check
  `seedState`, `TEST_MANIFEST`-based fixtures, and any test asserting on a whole state object rather
  than named fields.
- `goToCommandByReplay` and `fromShorthandPath` have their own `commandIndex`-based progress checks
  with the same blind spot. Out of scope here; `ROUGH_EDGES.md`'s looping-story entry covers
  the `goToCommandByReplay` one, which fails differently and worse.

## Done when

- A skip or wheel step around a `label`/`jump` loop is recorded, and `undo` walks back over exactly
  that iteration - covered by a unit test.
- Advancing at the end of a story still records nothing, and `undo` there still does not throw - the
  existing tests in `test/unit/state.test.ts` cover this and must stay green.
- `CLAUDE.md`'s path-replay note and `ROUGH_EDGES.md`'s fourth looping failure mode are updated or
  removed to match.
