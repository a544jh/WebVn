# 01: Closing a project and opening another

Status: done

Blocked by: nothing (can start immediately).

## What to build

The editor can put a project down. Today a page load is the only teardown there is: nothing releases
the lock, nothing stops the storer, the renderer keeps two `document` listeners and two timers, and
both roots keep whatever was mounted in them. Switching projects is a **full teardown and remount
through the same path as initial boot**, never a live swap, so each of those has to become an
explicit step before any UI can trigger one.

No new UI, and nothing an author can see. It is a prefactor, and it is first because every ticket
below remounts in the same page.

## The four things a session holds

- **The storer.** `ProjectStoring` registers `focusout`, `visibilitychange` and `pagehide` and never
  removes them. Its constructor comment has the fix - an `AbortController` owned there, `{ signal }`
  on the three listeners, and a `stop()` - and, more importantly, the reproduction that makes this
  ticket first rather than tidy: boot on A, type without waiting out the debounce, boot on B, fire
  `visibilitychange`, and A's storer writes. That write is harmless in itself. The loss is on a
  switch *back* to A, which then has two storers: the stale one holds older text and queues its
  flush last, and per-path serialization makes the last *queued* write win, so older text lands on
  top of newer. Flush before stopping, so closing a project does not throw away the debounce
  interval's worth of typing.
- **The renderer.** `keydown` and `fullscreenchange` are on `document`, autoplay is a
  `setInterval` and skip mode a self-rescheduling `setTimeout`. A superseded renderer otherwise
  answers the keyboard and advances a story nobody is looking at, into elements that are no longer
  on screen.
- **The lock.** `ProjectLock.release` exists and nothing in the app calls it - the comment says it is
  there for tests, because there was no switching. This is its first real caller, and that comment
  stops being true.
- **The DOM.** Both roots are emptied, so a remount produces one editor and one vn rather than
  stacking a second of each under the same elements.

## Where it goes

`bootEditor` hands back `close()` beside the `openProject()` thunk it already returns: the thing that
built the session is the thing that takes it down, and the entry point keeps its one line of wiring.
`BootedEditor` already carries every part `close()` needs.

`close()` resolves when the last store has landed, so a caller can await it before opening the next
project. That matters for ticket 04, where the next project is the same files under a different
directory.

## Acceptance criteria

- [ ] `bootEditor` returns a `close()`; calling it flushes what is pending, stops the storer, tears
      the renderer down, empties both roots and releases the lock
- [ ] After close, `focusout`, `visibilitychange` and `pagehide` write nothing
- [ ] After close, a keypress does not advance the story, and any autoplay interval or skip-mode
      timer is cancelled
- [ ] After close, a second boot on the same directory takes the lock rather than being refused
- [ ] The measured loss is gone: boot A, type, close, boot B, boot A again, and A opens with the
      newest text rather than the stale storer's
- [ ] A remount into the same elements leaves one editor and one vn, not two
- [ ] The comments that describe the absent teardown are updated to what is now true:
      `ProjectStoring`'s constructor, and both places saying nothing in the app calls `release` -
      `ProjectLock` itself and the `lock` field on the boot result

## Not in scope

- **Any UI.** Nothing calls `close()` from the app yet; the tests are its callers. That is the same
  rule this codebase already applies to `AssetResolver` having no `release`, inverted: the caller
  arrives in ticket 02, one ticket later, which is what makes building it now correct rather than
  speculative.
- **The renderer's own asset eviction.** The loaders hold every registered asset decoded with no
  eviction, and a project switch is the first moment that is a leak rather than a bound. It is a real
  cost - a 1920x1080 background is about 8MB decoded whichever file it came from - but it is a
  separate change with its own blast radius, and the object-URL lifetime test pins why a naive revoke
  is wrong.

## Comments

**Landed 2026-09-05**, on `claude/project-library`. `bootEditor` returns `close()`;
`ProjectStoring.stop()` and `DomRenderer.teardown()` are what it calls. Covered by
`test/browser/CloseProject.test.ts`, including the measured loss end to end - boot A, type, close,
work in B, reopen A.

One deviation from the acceptance criteria, and it is deliberate. **The vn root is restored to the
markup it was handed rather than emptied.** The action bar lives inside `#vn-div` in both html files
and a renderer *queries* it rather than creating it, so emptying that root outright would leave the
second session with no Back, Menu, Auto or Skip - which fails "a remount leaves one vn" by a reading
the criterion did not intend. `DomRenderer` captures `innerHTML` at construction and puts it back, so
the element is left as it was found. The editor's root *is* emptied, because the editor fills it
entirely. `test/browser/CloseProject.test.ts` pins both halves.
