# 02: A story that loops, met in the editor

Status: done

Blocked by: 01 (the stage's Story error, which this makes the one place a loop is reported).

## What this is

Ticket 01 gave the stage a "Story error" for a story that goes round a loop with nothing to stop on,
reached by playing. `ROUGH_EDGES.md` filed two more ways to meet a loop, both in the editor and both
out of 01's scope:

- **An edit's replay threw.** Adopting the manifest, clicking the gutter on an edited script and the
  reload after a rename all replay the author's path against the new script. When the edit put a loop
  on that path the replay threw `EndlessLoopError` out of the click, uncaught, with the editor
  half-updated.
- **A replay jump failed two ways.** If the walk to the clicked line met a loop with no stop in it, it
  threw. If it circled a loop *with* stops, the no-progress check (`commandIndex === before`) missed it
  - two stops alternate and never repeat - so the walk spun to the cap and returned normally, adopting
  a path of ten thousand advances as though it had arrived.

## What was decided

One rule, agreed with the maintainer on 2026-10-03: **no core replay reports a loop itself; the stage
does.** A replay treats a loop as one more way for the story not to fit, and the editor gutter tells
the author where.

1. **An edit's replay keeps the author's place up to the loop.** `replayAsFarAsPossible` treats an
   action that now walks into a loop as an action that no longer applies, exactly as it treats a
   deleted line. A story that loops before its first stop has nowhere to land, so nothing is kept and
   nothing is run, and the render that follows shows the Story error, with Go back greyed out.
2. **A replay jump that cannot get there is refused** with `UnreachableCommandError`, and the player
   keeps its state and path, as a refused load does. The editor marks the clicked line with a warning
   that says why and that a direct jump still goes there.
   - **The loop is found by position, not by index.** A command is a pure function of the state, and
     only the index and the variables decide where a walk goes next. So a position - index plus
     variables - seen again with no decision answered in between is a walk going round forever. That
     catches the two-stop loop the index check missed, while a loop that counts its way out (`$i += 1`
     until 3) comes back to the same line with a different count and still arrives. The cap stays as a
     backstop.
3. **The editor marks the jump that closes the loop** when the stage shows its Story error: an error,
   so the script tab goes red. Found at runtime (`State.loopJump`) rather than by reading the script,
   because a conditional jump makes a static check report loops that do exit.

## Comments

**Implemented 2026-10-03** on `ccr-4ffaa934-lt4j4l`, in the same pull request as 01.

- `src/core/vnPath.ts`: `Advance.tryPerform` and `MakeDecision.tryPerform` stop at a loop, and
  `replayAsFarAsPossible` survives one before the first stop.
- `src/core/state.ts`: `goToCommandByReplay` refuses with `UnreachableCommandError`, by position; it
  also stopped recording an advance that applied nothing at the end of a story, which is the rule
  `appliedAny` exists for. `loopJump` walks on a fresh `seenCommands` until a position repeats, then
  once round the loop, and takes the furthest command that sent the index backwards - of nested loops,
  the outer one.
- `Renderer.onLoopCallbacks`, fired by `DomRenderer.showLoopError` with that jump. `VnEditor` marks it,
  and catches the refused replay jump in `goToLine`. `ReactRenderer` gains the empty array the
  interface now asks for; it is still not wired up.
- **Tests:** `test/unit/state.test.ts` (an edit's replay into a loop, a decision now leading into one,
  a loop before the first stop; a replay jump refused behind a stopless loop, a two-stop loop, a
  one-stop loop and a loop before the first stop, still arriving past a counting loop, the player left
  where it was; `loopJump` from inside the loop, from the stop before it, past a counting loop, and on
  an untouched seen set). `test/browser/EditorLoops.test.ts` (the jump marked and the tab red, both
  gone once the script is fixed, an edit into a loop keeping the author's place, a refused replay
  jump's warning, and the direct jump that still arrives). The edit test was run against the old
  replay and failed with the uncaught `EndlessLoopError` it was written for.
- `ROUGH_EDGES.md`'s looping-story entry is retired: all three of its cases are now handled.
