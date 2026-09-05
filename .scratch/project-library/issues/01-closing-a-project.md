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
  - **And the two sub-renderers that own something outside the root.** Added 2026-09-05, after Back
    to projects shipped and the music kept playing over the picker. `AudioRenderer` plays through
    detached `<audio>` clones the loaders hand out - they never enter the document, so nothing about
    putting the vn's DOM away stops one, and a looping track never stops itself. `BackgroundRenderer`
    reschedules a `requestAnimationFrame` for as long as a transition or a pan has frames left, into
    a canvas that is no longer on screen. Both now have a `teardown()`; the audio one silences
    immediately rather than fading, because a graceful fade-out of a project the author has already
    left is a second and a half of a story that is gone.
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
- [ ] After close, nothing this session started is still playing, and no animation frame is still
      being asked for
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

**Audio outlived the teardown, and shipped that way.** Found 2026-09-05 by using the thing: Back to
projects left the music playing over the picker. The teardown restores the vn root's markup, which
puts away everything a sub-renderer *drew* - but `AudioRenderer` does not draw. It plays through
detached `<audio>` clones the loaders hand out, which never enter the document at all, so there was
nothing for the markup restore to reach and nothing else stopping them.

Two reasons no test caught it. Nothing tore a renderer down with audio playing, because until Back to
projects existed nothing tore one down at all; and **the demo suite stubs `HTMLMediaElement.play`**,
so the one suite that exercises audio never has an element that is really playing to leave behind.
`test/browser/CloseProject.test.ts` now stubs `play` *and* `pause` and asserts that everything a
session started was stopped when it closed, which is the assertion the stub makes possible rather
than one it prevents.

`BackgroundRenderer`'s `requestAnimationFrame` chain was the same shape and was fixed alongside it -
not a visible symptom, but a live frame loop per abandoned session, drawing into a detached canvas.

## Comments: the teardown sweep, 2026-09-05

Three separate reports of something surviving `close()` - a hidden mount, then audio - prompted a
deliberate audit of everything a session holds rather than waiting for a fourth. What it found, in
full, so the next reader knows what was and was not looked at.

**Fixed here:**

- **A late caller could still paint into the root.** `VnEditor.loadScript` awaits `loadAssets` before
  handing the story to `loadStory`, and Back to projects is clickable throughout that wait - so a
  close landing mid-load left the story to be painted into a root the next session was about to be
  given. `DomRenderer` now has one `torn` flag, checked in `render`, `loadStory` and `setScale`: a
  torn-down renderer does nothing. That is the net under every late continuation rather than a guard
  per hazard, which is what the previous three fixes each were.
- **`enterFullscreen`'s 500ms settle timer was untracked.** It calls `setScale`, which writes a
  transform onto the root this renderer shares with whatever comes next. Now cleared on teardown, and
  guarded by the flag above as well. Not covered by a test: `requestFullscreen` needs user
  activation, which is why CLAUDE.md already says fullscreen is verified by hand.
- **The autoplay pill was toggled through a page-wide `document.querySelector`.** Survivable while one
  vn was all a page could hold; simply wrong now that a session and a picker share one. Scoped to the
  renderer's own root.

**Found and recorded rather than fixed** - both in ROUGH_EDGES.md:

- **Object URLs accumulate across sessions.** `OpfsAssetResolver` mints one per asset and never
  revokes; within a session that is deliberate and pinned by a test, but nothing releases them when
  the session ends, so each project switch holds another project's assets in memory for the life of
  the page. A real leak, and a different item from the loaders' lack of eviction that this ticket
  scoped out - that one is released with its session and this one is not.
- **CodeMirror 5's teardown is unverified.** Emptying the root removes the wrapper and CM5 offers no
  `destroy()`. Whether it leaves anything document-level behind was not established, and is written
  down as unknown rather than assumed clean.

**Checked and clear:** every `document`/`window` listener goes through an `AbortController`
(`DomRenderer`, `ProjectStoring`); the skip, autoplay and store-debounce timers are cancelled; the
background's `requestAnimationFrame` chain and both audio fade chains are flag-gated; no callback is
pushed into anything longer-lived than the session that pushed it; the only DOM appended outside the
two roots is a `<dialog>`, which removes itself on close and cannot be open across a view swap
because `showModal` makes the rest of the page inert; and the module-level state in `opfs.ts`,
`persistence.ts` and `projectStore.ts` is either self-clearing or deliberately once-per-page.

