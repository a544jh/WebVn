# Await transitions through the Web Animations API

Status: ready-for-agent

Every awaited animation in `src/domRenderer/` resolves off a `transitionend` listener, and
`transitionend` is not the only way a transition ends. When it ends another way the promise never
settles, and `DomRenderer.render`'s `Promise.all` never completes - so the render loop stops
advancing the story. Replace the listeners with
`Promise.all(elem.getAnimations().map((a) => a.finished))`, which is correct however the transition
ends and needs no listener bookkeeping. Filed 2026-08-29 out of the scroll-wheel crash work
(`claude/end-of-story-path-steps`).

Not urgent: no known path from real input reaches any of it. See "Reachability" below before
promoting this.

## The three ways a transition ends, and what each does today

Measured in the browser suite's Chromium, not reasoned from the spec:

| How it ends                                                       | Events fired            | Awaited promise today | `a.finished`               |
| ----------------------------------------------------------------- | ----------------------- | --------------------- | -------------------------- |
| Completes                                                         | `transitionend`         | resolves              | resolves                   |
| Retargeted to the value it already holds                          | `transitioncancel` only | **never settles**     | rejects `AbortError`       |
| Element detached mid-transition                                   | `transitioncancel` only | **never settles**     | rejects `AbortError`       |
| Never starts (property set to its current value, nothing running) | none                    | **never settles**     | `Promise.all([])` resolves |

So `finished` covers all four, at the cost of a `.catch` - a cancelled animation _rejects_, and a
cancelled render step is a step that is over, not a step that failed.

## The primitive

```ts
// Resolves when every transition running on `elem` is over, however it ended. A transition can
// complete, be cancelled - retargeted to the value it already holds, or its element detached by
// the next render - or never start at all, and only the first of those fires `transitionend`.
export const transitionsSettled = (elem: Element): Promise<void> =>
  Promise.all(elem.getAnimations().map((a) => a.finished)).then(
    () => undefined,
    () => undefined
  )
```

**It must be called after the style writes, not before.** That is the whole of why this is a
refactor rather than a second `addEventListener` next to each existing one: `getAnimations()`
reports what is running _now_, so arming it before the property changes reports the previous
render's transition, or nothing. Three `SpriteRenderer` sites and `DecisionRenderer`'s exit loop
currently arm their listener first and write the style second, and have to be turned around.

## Sites

- `TextBoxRenderer` - box entry, box exit (`removeFromDom`), and the name tag's enter, swap
  (`changeNameTransition`) and exit. All five already write the style before arming, so they are
  the easy half.
- `DecisionRenderer` - the exit branch's `resolveOnTransitionEnd` on the last option. Arms inside
  the loop _before_ setting `transform`; needs splitting into "set every option's style, then await
  the last".
- `SpriteRenderer` - `addTransitionEndPromise` (position moves, image-change fade-in, new sprite
  fade-in) and the removal loop's inline listener. The three `addTransitionEndPromise` calls all
  arm before writing.

## Cleanup that hangs off these listeners needs its ownership fixed at the same time

Two sites do DOM cleanup on `transitionend`, not just resolution, and cleanup that starts firing on
cancel can destroy a _newer_ render's work:

- `DecisionRenderer` exit sets `this.root.innerHTML = ""`. A cancel raised by a newer render
  arrives after that render has appended its own options, so this would wipe them. Remove exactly
  the elements this pass owns instead.
- `SpriteRenderer`'s image-change fade-out calls `spriteElem.remove()`. Safe as-is - the element is
  the pass's own and its `vnSpriteId` is already deleted - but confirm rather than assume.

## Reachability

Nothing here is reachable from real input today, which is why this is filed rather than fixed:

- **The decision stall.** Dismissing the options while their entry transitions are still inside
  their `transition-delay` retargets `scaleY(0)` onto an element already at `scaleY(0)`: cancelled,
  never completed, and the loop stops - `commandIndex` frozen, options still painted, until the
  next click renders unanimated and clears them. Only a direct `DomRenderer.makeDecision` call gets
  there. A real click cannot: the option's own handler defers `makeDecision` to the blink
  `animationend`, which lands after the stagger. Clicks at 0/10/50/150/300/450/700ms into the
  decision render were all clean.
- **The leaked promises.** A `render(false)` clones the box and the name tag to drop listeners,
  which detaches the node an interrupted animated pass is waiting on. That pass never resumes: one
  permanently pending `Promise.all`, holding its closure, per interruption. Invisible, because
  `renderGeneration` already discards that pass - but it is why the interrupted-render cases in
  `ROUGH_EDGES.md` do not double text, so it is load-bearing by accident.

## Relation to threading the render generation

Different problem, and this one first. `renderGeneration` is checked _on resume_, so it does
nothing for a pass that never resumes - which is precisely what the never-settling promises are.
Threading the generation into the sub-renderers (see `ROUGH_EDGES.md`) stops a superseded pass
_painting_; this stops it _hanging_. Doing this one first also shrinks that one, since the resume
points it would guard are the same ones being rewritten here.

## Done when

- No `transitionend` listener remains as the resolution source of an awaited render promise.
- A `makeDecision` during the entry stagger advances the story and leaves no options on screen,
  covered by a browser test.
- An interrupted animated pass settles rather than hanging, covered by a browser test.
- `npm run test:demo` passes - this is the render loop.
