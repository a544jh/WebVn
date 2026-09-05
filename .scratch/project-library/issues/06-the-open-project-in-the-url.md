# 06: The open project in the URL

Status: done

Blocked by: 02 (the project library), 04 (renaming a project).

The picker and the session are two views of one page, so a reload lands wherever a cold boot lands -
the picker - no matter which project was open. The address bar says `index.html` and nothing else,
which means a project cannot be bookmarked, cannot be sent to the other window an author has open,
and cannot survive the reload that a webpack-dev-server edit triggers on every save.

Reflect the open project in the URL, and read it back on boot.

## The format

`index.html?project=<directory>`, chosen 2026-09-05 over a bare hash (`#demo`), a structured hash
route (`#/project/demo`) and a path segment (`/p/demo`).

- **It matches the one URL convention this app already has.** `player.html?vn=<payload>` names what
  to load in a query parameter; a second page naming what to load in a second query parameter is the
  same sentence twice rather than two dialects. `src/scriptUrl.ts` and `src/projectUrl.ts` are then
  the same shape - the one place a parameter is spelled - and neither needs a router.
- **A path segment was rejected on what it costs, not on how it looks.** Everything in `index.html`
  is relative: `<script src="app.js">`, and `playerUrl(encoded, location.href)` resolving
  `player.html` against the current document. A deeper path breaks both unless a `<base href>` is
  added, and it needs `devServer.historyApiFallback` (which nothing in CI exercises - see CLAUDE.md)
  plus a `404.html` shim under GitHub Pages' `/webvn-demo/` subdirectory. Three pieces of
  infrastructure for a prettier string.
- **The hash's argument was real and lost narrowly.** A project directory names something in this
  browser's OPFS and is meaningless to any server, so the fragment - never sent, never logged - is
  arguably the honest place for it. It was passed over for consistency with `?vn=`, which is the
  same kind of purely-client-side payload and is a query parameter already.

## What goes in it is the directory, not the id

Every read, write, store and lock addresses the **project directory**, and `bootEditor` is told a
directory. The id is the manifest's to declare and the two can disagree - a project whose manifest
does not parse has a directory and no id at all, and that project must stay openable, which is the
whole of ADR 0002 as the store applies it. So the URL carries what the boot can act on.

A rename is therefore a `replaceState`: the directory followed the id, and the URL follows the
directory. Same entry, said better - a rename is not somewhere the author navigated to.

It reaches **that entry and no other**, which is worth stating because the first draft of this
section claimed more. Open a project, go back to the list, open it again: the history now holds two
entries naming it, and a rename rewrites the current one while the older goes on naming a directory
that is gone. Walking back to it gets the fourth refusal below and the list. `replaceState` reaches
one entry and no API reaches the rest, so that is the ceiling rather than a gap to close.

**The parameter is not validated against `ID_PATTERN`.** It does not need to be: `isProject` is the
one question that matters, `exists` answers false for anything OPFS will not even name, and
"there is no project called `../etc`" is a better answer than silently dropping to the picker. The
banner writes it with `textContent`.

## A cold boot still enters the picker

Ticket 02 decided that, on 2026-09-05, when `lastOpened` was taken out of the boot path. This does
not undo it. `lastOpened` deciding where a boot lands is the app guessing; a URL deciding is the
author having said, in the one place a browser lets them say it, and a bare URL still lands on the
picker. The list is still ordered by `lastOpened` and still decides nothing.

## Back returns to the picker

`pushState` on open and on Back to projects, so the browser's Back walks the views the author walked.
A `popstate` handler puts the app where the URL now says, and **records** nothing back - the URL
already says where the author went, and the handler is what makes it true. It does still *write* on
one path: a link that will not open is replaced with the bare URL, because the author did not arrive
anywhere and the URL must stop saying they did.

The cost, worth naming because it cannot be designed away: `popstate` cannot be refused or awaited,
so the close it triggers - flush, stop the storer, tear the renderer down, release the lock - runs
*after* the URL has already moved. The debounce is what makes that safe, exactly as it is for a tab
close: `ProjectStoring`'s guarantee is the 2000ms interval and every flush is a bonus.

### Swaps run in a queue, and read the address bar at their turn

Not in the first draft of this ticket, and found by building it. Two view swaps in flight interleave:
the older one's `showPicker` lands *after* the newer revealed the session, hiding it again under a
renderer that has not measured itself - ticket 02's 0x0 background canvas, reached from a direction
nothing was guarding. `AppShell.queue` chains every swap, and a queue rather than the generation
guard `DomRenderer.render` and `ProjectPicker` use, because those two can drop a superseded pass
where all that is lost is a paint, while a swap holds a lock and a storer and has to finish.

**The rename is queued with them, dialogs included.** It is the only swap long enough for a
`popstate` to land in the middle of, and unqueued it closed the session the rename was still holding
- a second teardown and a second lock release - then drew the list. `RenameProject.test.ts`'s "wins a
race with a Back pressed while it is asking" is the net, and it asserts the close count rather than
the end state, which converges either way.

**A queued swap reads the URL when its turn comes**, not when the navigation fired. Two things
follow. A burst of back-and-forward collapses: every queued swap reads the same final URL, so the
first finds itself already there and the rest have nothing to do - the author's project is not torn
down for a round trip they undid. And a rename that lands while a Back waits behind it **wins**: the
rename moves the URL to the new directory as it reopens, and the Back then reads that and finds the
session matching. The Back is swallowed. Chosen deliberately, 2026-09-05: acting on the stale bare
URL instead drew the picker under a URL naming the renamed project, and a swallowed Back is a smaller
wrong than a lying URL.

Second Back leaves the app, as it did before.

## The three ways in, and one routine

- **The first load** reads the parameter and goes there.
- **The picker** opens a row and the URL records it.
- **Back and forward** move the URL and the app follows.

The first and third are the same thing - a directory arriving from outside - and go through one
private `goTo`, which closes whatever is open and opens what was named. The public `openProject` and
`backToProjects` are the author's own gestures: they do the work and *then* write the URL. That split
is what stops a `popstate` from pushing an entry for the navigation it is already reacting to.

## A URL that names a project that will not open

Two reasons, and `bootEditor` grows the second:

- It is open in another tab. Already a refusal.
- **There is no project called that.** New. A deleted project's bookmark, a typo, a link from another
  browser's library. Today `readProject` throws and the entry point's catch says "Something went
  wrong opening your project", which is true of nothing in particular. `bootEditor` already owns
  "this is why you cannot open this project" with one surface for every reason, so the fourth reason
  goes there rather than in the URL layer - a stale picker row racing a delete in another tab reaches
  it too. The check is `isProject`, which is the same definition `listProjects` skips a directory on,
  and it is taken **with the lock in hand**: a delete takes the lock first, so holding it is what
  makes the answer stay true between asking and reading.

**A refusal carries its own advice.** `RefusedBoot` is a reason *and* an advice line, because the
picker used to append one hard-coded sentence to every reason - which was true while the only
refusal was the lock, and read as *"There is no project called "x". Close it there."* the moment a
second reason existed. `OpenProject` therefore hands back the whole notice rather than a string to
dress up at the far end.

Either way the author lands on the picker with the reason in the banner it already has, and the URL
is **replaced** with the bare one. The invariant is that the URL matches the view; a URL left naming
a project the author is not in would make Back and Forward describe a history that never happened.
The cost is that closing the other tab and reloading gives the picker rather than the project, which
is the honest half of the trade.

`ProjectPicker` therefore takes a refusal it did not produce. It is the first one it has been handed
from outside - every other banner it shows, it raised itself - because a first load has no picker
standing when the boot is refused.

## Recovery still runs before anything opens

`recoverProjects()` runs before the picker's walk on every render, and a URL that opens a project
skips the picker entirely. So `start()` runs it too, and only when the URL names something - a bare
boot would otherwise walk the store twice, since `showPicker` runs it anyway.

Without this, a rename crashed mid-flight plus a bookmark to the old directory is an author editing
a tree that the next picker render will finish removing.

## Testability

The address bar is injected, `Navigation` in `src/projectUrl.ts`, and `AppShellOptions` requires one
rather than defaulting to the browser's. Two reasons, and the second is the load-bearing one:

- The browser suites run in a page whose URL is vitest's, and a suite that pushed onto it would be
  writing into the runner's own address bar.
- A default would be silently taken by anything that forgot to pass one. Two construction sites
  exist; both should say which address bar they are driving.

`browserNavigation()` is four one-line members over `location` and `history` and is the humble object
here: it ships untested, like the element lookups in `src/index.ts`, and everything above it is
driven by `test/helpers/navigation.ts`'s fake.

It never removes its `popstate` listener, which is correct here and would not be in
`ProjectStoring`: one page load is one shell, and the shell outlives every session in it.
