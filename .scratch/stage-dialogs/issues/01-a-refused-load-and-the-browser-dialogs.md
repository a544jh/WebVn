# 01: A refused load says so, and the stage asks its own questions

Status: needs-triage

Blocked by: nothing in code - the refusal it presents is built, see below. Blocked in practice by a
drawing, see "The canvas has to go first" - **drawn 2026-10-03, waiting on review**: see "What the
drawing proposes".

## What this is

Two things, filed together because neither can be done well without the other.

**A save slot that no longer fits the story is refused at load, and the refusal is invisible.** Since
2026-09-19 `State.fromShorthandPath` refuses a save whose advances run past the end of the story, as
it already refused one answering a decision with an option that is gone. Nothing presents either.

**The player still asks its questions through the browser.** Four call sites, all on the stage:

- `SaveLoadMenu` - `window.confirm` before an overwrite, a load and a delete.
- `DomRenderer.render`'s loop guard - `alert("Seems like we're stuck in an infinite loop")` when a
  story loops without ever stopping.

A browser dialog leaves fullscreen, so a mobile reader is thrown out of fullscreen just by answering
one, and it wears the browser's look rather than the story's. `ROUGH_EDGES.md` has an entry for each.

They are one ticket because the first has nothing to say its message with except the second. The
obvious fix for an invisible refusal is an `alert()`, which is the thing the second removes.

## What the reader sees today

1. They open the Load menu and click a slot made against a longer script.
2. The browser asks "Are you sure you want to load?", and they click OK.
3. Nothing visible happens. The menu stays open, the story behind it is unchanged, and the only trace
   is an uncaught `Error: Saved path runs past the end of the story` in the console.
4. Clicking again repeats it. Return closes the menu on the story exactly where they left it.

The throw comes out of `renderer.loadFromSlot(slot)` inside a bare click listener, which skips the
`renderer.closeMenu()` after it. A slot whose decision no longer fits has always failed this way.

Before 2026-09-19 the past-the-end case looked like it worked: the load closed the menu on the last
line of the shorter story, and the first undo after it threw. So this is a better failure than it
was, but still a dead button.

## What is already decided

- **A save that does not fit is refused, not cut short.** `reloadStory` cuts the current path at a
  shortened story's end, because the author is mid-edit and wants to stay near where they were. A
  reader loading a save expects to land where they saved, and landing somewhere else without a word
  is the silent divergence `ROUGH_EDGES.md`'s stale-save entry refuses on purpose.
- **A refused load leaves the player where it was.** `VnPlayer.loadFromSlot` assigns nothing until the
  replay has succeeded; `test/unit/state.test.ts` pins it. The presentation can rely on that.
- **Whether a save fits is a replay question, not a version stamp.** A script hash on each save would
  refuse saves an edit never touched - a typo fixed in a scene the save never reached - while a replay
  answers the question exactly.

## The parts that are not pixels

A proposal, not a decision - triage should confirm or overturn each.

1. **A typed refusal.** Both refusals throw `Error` today. A class of their own
   (`IncompatibleSaveError`, or whatever the vocabulary below settles on) lets the menu catch exactly
   those and let anything else through as the bug it is. Decide whether `fromShorthandPath`'s other
   throw joins them: its ten-thousand-advance cap now fires only for a looping story whose save waits
   on a decision the loop never offers, which is arguably a save that does not fit either.
2. **`VnPlayer.canLoadFromSlot(slot)`**, a trial replay against `startingState`, so the Load menu can
   know before the click. Pure and synchronous, one per slot per menu draw. **Run it on a fresh
   `seenCommands`**: `advance` writes into the shared seen set, so checking a slot the reader does not
   load would mark its route as read and let skip mode run through it. No command's `apply` reads the
   set, so an empty one gives the same answer.
3. **A slot that will not load is drawn inert**, with a line saying why and its delete still live -
   deleting it is the one useful thing left to do with it.
4. **The click still catches the typed refusal**, marking the row the same way and keeping the menu
   up. The answer from the draw can go stale: in the editor, adopting the manifest and a gutter click
   after a script edit both run `reloadStory`, and nothing stops either while the menu is open.
5. **`DomRenderer.deleteSave` stores what it deletes.** It splices `player.saves` and writes nothing, so
   a delete reaches `localStorage` only with the next advance, and a reader who deletes a dead slot and
   closes the tab finds it back. Small, but this ticket makes delete the way out of a dead slot.

## The stage's own dialogs

**They belong to the stage, not to `src/chrome/dialog.ts`.** `CONTEXT.md` puts dialogs in the
*chrome*, the authoring tool's surfaces under `--vn-editor-*`; these are the story's, under `--vn-*`,
and a second theme restyles them with everything else on the stage. And they must be drawn *inside*
the vn root: `enterFullscreen` fullscreens the renderer's container, so a dialog drawn in the root goes
fullscreen with the story. The menus already draw into the
root's `menuDiv` through `showMenu`/`closeMenu`, which is the obvious home. Whether a `<dialog>` with
`showModal()` also works over a fullscreen element has **not** been checked, and drawing into
`menuDiv` needs no such guarantee.

**The three confirms are one component asked three questions.** Overwrite, load and delete each want
a sentence and two answers. Whether the confirm replaces the save list or sits over it is the
drawing's call.

**The loop guard is a different kind of thing, and the drawing has to decide whether it is a dialog at
all.** It is not a question - there is no answer a reader can give - and the mistake is the author's:
a `jump` back to a `label` with no stop between them. `ROUGH_EDGES.md` leans towards a console error
and a hard cap, with nothing on the stage. In the editor the author is better told in the script
gutter, against the `jump`, than on the stage. In the player a published story that does this is
broken, and a reader is owed at least a line saying the story has stopped rather than a frozen frame.
So: nothing, a line on the stage, or a dialog, and possibly a different answer in the editor and the
player. Leaning: a line on the stage in both, plus the gutter in the editor as its own ticket.

## The canvas has to go first

**Drawn 2026-10-03** as the canvas's fourth page, *Stage* - nine boards and seven notes, for review.
What follows is the brief it was drawn against; "What the drawing proposes" below is what came back.

The design canvas `.scratch/project-library/design.md` links is binding for pixels, and it has two
pages - **Project library** and **Asset panel** - on which every artboard is chrome. Nothing draws the
stage's menus at all; the pause and save/load menus predate the canvas. So this wants a new page, the
stage's own, with at least:

- the Load menu with one slot that will not load
- the confirm, with the load, overwrite and delete wordings
- whatever the loop guard's decision above turns out to be, if it is anything

The constraint the drawing works inside: the stage is 1280x720 (`#vn-div` in `defaultTheme.css`),
scaled whole into fullscreen, so a phone reader sees these at a fraction of that - which is the reader
this ticket exists for. Only `--vn-*` tokens and `--vn-font`.

Worth knowing while drawing: a slot is labelled today with an ISO timestamp and the raw shorthand path
(`save.path.join(" ")`), which is engine internals shown to a reader. Out of scope here unless the
drawing decides to change it anyway.

## What the drawing proposes

All of it for review, and none of it built. The canvas page is *Stage*. Every board on it inlines
`defaultTheme.css` and `gg.css` exactly as they ship, then a block marked **PROPOSED**, which is the CSS
this ticket would add and is the spec for it, then a block marked **DRAWING ONLY** (a gradient scene in
place of the background canvas, the action bar shown as a touch screen shows it). The boards are the
Load menu with a save that will not load, the load confirm, the delete confirm on that save, the Save
menu with the same save, the overwrite confirm, the loop guard, and three of them again at a phone's
scale.

- **Vocabulary: _incompatible save_**, with _Avoid_: stale save, outdated save, old save, broken
  save, corrupt save; `IncompatibleSaveError`. Not *stale*, because it says older and the script can
  move either way under a save. A reader never sees the term. They read **"The story has changed
  since this save. It cannot be loaded."** - in Load and in Save alike. That sentence is true in both
  directions and says neither *version* nor *path*.
- **The inert row's label fades with `--vn-disabled-opacity` alone**, not with `--vn-disabled-color`
  as well. A disabled menu item is one word whose place says what it is. This label is the only thing
  saying *which* save it is, and the two tokens together left it unreadable at a phone's scale.
- **The note is small, so the row keeps its 100px**: 16px on 20px lines, one sentence per line.
  That is the now-playing line's size, proposed as a token, `--vn-font-size-small`, now that two rules
  spell it. It reads at 9px on the phone. The first draft set the note at 28px and grew the row,
  which the maintainer turned down.
- **DEL becomes a target on every row**: a square the row's height, 100px, which is 54px on the
  phone drawn. Today it is a three-letter word in the corner, about 27 by 15px on that phone.
- **In Save the same row keeps its note but stays live.** Overwriting a save that will not load is a
  good use of its slot. Overwrite still asks.
- **The confirm takes the list's place rather than sitting over it.** The first draft put a panel
  over a scrim over the list. Every stage surface is translucent, so the list's text read through the
  question. The list and Return are `visibility: hidden` while the question is up, which keeps the
  list's scroll position for Cancel. Right-click backs out of the question before it backs out of the
  menu. The confirm is centred in the stage *above the nametag*, for the same reason: story text
  under its boxes would read through them.
- **The confirm is built from the stage's own kind of box**: one translucent `--vn-surface` box
  holding the text, and one box per answer, with no panel around them and no outline. The text box
  holds the question, the slot it is asking about, and one consequence line - "Unsaved progress will
  be lost." for Load, "This cannot be undone." for Overwrite and Delete. The slot is repeated at full
  strength even when it will not load, since its row may be scrolled away.
- **The answers take a decision item's two fills**: `--vn-surface` at rest, `--vn-surface-active`
  under the pointer. They take the fills only: a decision item blinks between the two when chosen,
  and an answer does not (the maintainer's call, 2026-10-03). Neither answer is marked out, because
  the question already says what the act is.
  Cancel is left and the act right, as the chrome's dialogs order them. Both answers are 88px tall,
  48px on the phone.
- **One component, `.vn-dialog`**, serves the three confirms and the loop guard's error.
- **The loop guard is an error, centred, with two ways out.** It reads "Story error" and "The script
  loops endlessly here, so the story cannot continue.", and its answers are **Go back** and **Start
  over**. It replaces `alert()` in the editor and the player alike. It was first drawn as a line across
  the top of the stage; the maintainer asked for it centred, worded as an error, and with a way out.
  - It sits in the menu container, so the stage under it is dimmed and takes no taps. **A tap must
    not resume**: `advance()` resets `consecutiveCommands`, so today a tap runs the same loop another
    ten thousand times. Right-click does nothing while it is up, because closing it would leave a
    stage that cannot move.
  - **Go back is `DomRenderer.undo()`.** `VnPlayer.advance` records an advance on the path only when
    it is made from a stop, so the loop's own steps are never recorded. One undo therefore pops the
    reader's advance into the loop and lands on the line they last read. From there, Back walks on to
    an earlier decision, which is the only real way round a loop that is in one branch. Go back is
    greyed out, as Save is, when the loop comes before the first stop and there is nothing to go back
    to.
  - **Start over** plays the story from the top and keeps `seenCommands`, so skip mode runs back to
    where the reader was.
  - **Not offered**: reloading the page, which in the player is Start over with a flash and in the
    editor reboots the project for nothing; and Load, which is one Go back away, through the menu.
  - The gutter marker in the editor stays its own ticket.
- **Noticed and left alone**: Return is 34px tall (18px on the phone), and on a touch screen it sits
  over the action bar between Back and Menu.

## Vocabulary to settle

`ROUGH_EDGES.md` says *stale save*, the proposal above says *incompatible*, and the refusal's own
message says the path "runs past the end of the story". A reader-facing sentence cannot say *path* or
*replay*. Pick one term, add it to `CONTEXT.md` beside **Save slot** with the others on its _Avoid_
line, and use it in the error class, the tests and the text on the stage. The text itself - something
like "This save was made with a different version of the story" - ships to readers, so it is the
drawing's to word, not the implementer's. *Different*, not *earlier*: in the editor the script can move
either way under a save.

## Out of scope

- Cutting a stale save to what still replays. Decided against, above.
- The editor's dialogs, which `src/chrome/dialog.ts` already provides.
- What a slot is labelled, and thumbnails on slots.
- Catching the other replay throws at the editor boundary - `ROUGH_EDGES.md`'s looping-story entry.

## Tests

- `test/unit/`: `canLoadFromSlot` answers yes for a slot that fits and no for one past the end and one
  with a gone option, and leaves the player's `seenCommands` untouched. The refusals are the typed
  error. The existing "leaves the player where it was" test stays.
- `test/browser/`, through `startVn` with a save in hand: the Load menu draws an unloadable slot inert
  with its note and a live delete; the stage's confirm loads on yes and does nothing on no; a delete is
  in `localStorage` without an advance after it.
- No browser dialog remains: stub `window.confirm` and `window.alert` to throw in the menu suites, so a
  call that comes back fails loudly.
- Fullscreen, by hand with `npm run dev`, like `enterFullscreen` itself - nothing automated can enter it.

## Comments

**Filed 2026-09-19** on `claude/path-recording` (PR #49), beside the refusal it presents, rather than
built there: that branch fixes path recording, and this is a reader-facing surface with a drawing and
a vocabulary decision in front of it. What the reader sees today was traced from the code and the
refusal's unit tests, not clicked through in a browser.

**Drawn 2026-10-03** on `ccr-4ffaa934-lt4j4l`: the canvas's fourth page, *Stage*, published as the
canvas's version 31. The boards were rendered in headless Chromium against the shipped stylesheets
before publishing, at full size and at 844x390. Two drafts were redrawn on what that showed: the
confirm, whose translucent panel let the list read through it, and the inert label, which was
invisible at a phone's scale. Status stays `needs-triage` until the proposals in "What the drawing
proposes" are confirmed or overturned.

**Revised 2026-10-03** after the maintainer's first review, as the canvas's version 32. The confirm
lost its panel and its white outline on the act: it is now a text box and two answer boxes, and the
answers use the decision item's fills.

**Revised again 2026-10-03**, as the canvas's version 33. The note on a save that will not load is
16px, so the row no longer grows. The loop guard is a centred error with Go back and Start over, built
from the confirm's boxes.
