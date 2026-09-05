# 02: The project library

Status: done

Blocked by: 01 (closing a project and opening another), 00 (the chrome's font and icons).

## What to build

An author can see the projects they have and open one, without the console. The picker is **its own
page, shown before the editor boots**: it lists what `listProjects()` enumerates and opens whichever
is chosen. The editor gains a **Back to projects** button in its upper left, which is the way back.

Amended 2026-09-05 - this was first specified as a panel in the editor's chrome. `design.md` holds
the drawings and the reasoning; three things below follow from the change.

**It is a view, not a third html page.** The app stays a single page: the picker is swapped in where
the editor would mount, and opening a project never reloads. `editorBoot.ts` already returns either a
booted editor or a refusal, so the seam exists. It lives in `src/picker/` - not `src/editor/`, since
it must render without one and outlives any one editor session, and not `src/storage/`, which is
deliberately UI-free. Its font, icons, status colours and dialogs come from `src/chrome/` (ticket
00).

**And it comes down when the editor goes up.** The picker is created and destroyed on every Back to
projects, so it takes the same `AbortController` and `stop()` shape ticket 01 gives the storer, for
the reason already written into `ProjectStoring`'s constructor: a superseded component that kept its
listeners is a measured data-loss bug, not a tidiness question.

This is the first ticket in the tranche an author can see, and the one that makes `lastOpened` do
work: until now there has been exactly one project to open, so the store's "`lastOpened`, else the
first listed" has been a rule with nothing to decide.

## What the list shows

Title where the manifest parses, the directory name where it does not. **A project whose manifest
does not parse must be listed**, with whatever the store reports: it is an author's project with a
typo in it, and the library is the one place they would go to open it and fix it. That is why
`ProjectSummary` carries a nullable id rather than the store returning a list of ids, and hiding such
a project here would undo the reason.

**Nothing is marked as open, because on this page nothing is.** That criterion was written for a
panel living inside a booted editor. The ordering carries it instead: `lastOpened` descending, so the
row the author wants is first, and that is still the field this ticket makes do work. Enumeration is
the truth about what exists, so the list is a walk of `projects/` every time it is shown - there is
no index file, ever.

## Opening a project

Opening is a **full teardown and remount through the boot path**, never a live swap. `VnPlayer`,
`DomRenderer` and the resolver never learn that other projects exist; they are rebuilt, on a state
seeded from the chosen project's own manifest, which is what carries the save key with them.

**From the picker nothing is held, and that is what the page shape buys.** Back to projects tears
the session down and releases its lock on the way out, so by the time a project is chosen there is
nothing to strand: a refusal leaves the author on the picker, looking at the list, which is a place
they can stay. The "take the new lock before closing the old" ordering this ticket first specified
was protecting against a mid-switch refusal that can no longer happen here.

`bootEditor` still grows a way to be told which directory to open - `chooseProject` stays what a cold
boot uses, and the picker names its directory - because **ticket 04 still needs it**: a rename
reopens the session under a directory the old lock does not cover, and that one *is* a live swap with
something held. The ordering rule moves there rather than disappearing.

Order, then: choose, take the lock, boot, write `lastOpened`. A refusal at the lock changes nothing
and says so on the page.

**A cold boot always enters the picker.** Decided 2026-09-05. The original ticket said a reload
reopens the last project, which was written when the picker was a panel and every boot landed in the
editor regardless. As a front door it is the front door: `lastOpened` still exists and still orders
the list, but it no longer decides where a boot lands.

That takes both halves of `chooseProject` away (`src/storage/openProject.ts`). Its two jobs are
*which directory* - `lastOpened`, else the first listed - and *is the library empty, seed the demo*.
The author picking replaces the first, and the button below replaces the second, so
`editorBoot.ts:77` stops calling it. Delete it rather than leaving a function whose contract has
changed underneath it; `claimProject`'s `writeEditorState({ lastOpened })` half is still wanted and
moves to wherever the picker opens a project.

## Adding the demo

**Nothing seeds automatically.** The picker carries an **Add demo project** button which calls
`seedDemoProject()` and adds the row. `seedDemoProject` itself is unchanged - only its trigger moves.

- **Shown only while the demo is absent.** Its id is fixed (`demoManifest.id`), so a second press
  would collide with an existing directory; hiding the button once the demo is listed is both the
  collision fix and the honest signal. An author who deletes the demo gets the button back, which is
  correct - they can have it again.
- **It stays on the picker.** The row appears and the button goes, which is the confirmation. Unlike
  New project, which opens what it made, this one populates the library rather than starting work.
- **It writes under the demo directory's lock**, like any other write.

That last point is why this is a button rather than a seed, and it is worth stating because the
alternative looks simpler and is not. Seeding automatically has to happen *before* the picker can
render, at a moment when no project is chosen and so no lock is held - which is exactly what
`chooseProject`'s comment refuses, since a refused tab must not have written anything on its way to
being refused. An action can take a lock; a render cannot.

## Persistent storage

Folded in from what was ticket 06, which no longer exists.

Call `navigator.storage.persist()` **on the first store**, which still happens inside the editor
where a storer exists, and **report what it answered rather than assuming it succeeded**. Show
`navigator.storage.persisted()` on the picker, re-read on each render.

First run honestly shows "not persisted" until the author has entered a project and typed. That is
true rather than awkward, and first store is still the right moment to ask: the author has committed
work, so Firefox's prompt lands on someone who is invested rather than on someone who just arrived.

## Acceptance criteria

- [ ] The picker lists every project the store enumerates, with its title, ordered by `lastOpened`
      descending
- [ ] A project whose `manifest.yaml` does not parse is listed under its directory name, and opening
      it works - the buffers hold their real text and the manifest gutter marks the problem
- [ ] Choosing a project opens it with its own player, renderer, editor, storer and resolver, and its
      own save key
- [ ] Back to projects returns to the picker through ticket 01's teardown, writing unstored edits
      before it closes and releasing the lock
- [ ] Choosing a project that is open in another tab is refused, the author stays on the picker, and
      the page names which project and why
- [ ] `lastOpened` names the project opened, and orders the list descending - but a cold boot lands
      on the picker whatever it says
- [ ] First run shows an empty picker offering New project and Add demo project; nothing is written
      until one is pressed
- [ ] Add demo project writes the demo, adds its row, hides itself, and leaves the author on the
      picker
- [ ] Leaving the picker removes its listeners - a superseded picker does nothing
- [ ] `persist()` is called once on the first store and what it answered is reported rather than
      assumed; the picker shows `persisted()`
- [ ] The picker renders in the chrome vocabulary ticket 00 lands - Source Sans 3, Lucide icons - and
      the VN stage behind the editor is untouched

## Not in scope

- **Making or deleting a project.** Ticket 03. This one lists and opens.
- **Renaming.** Ticket 04, and its trigger is the manifest rather than the picker.
- **The confirm surface.** Ticket 03 builds it, in `src/chrome/` (ticket 00), because it must work
  over the picker with no editor mounted and inside the editor for 04's rename.
- **Per-project size.** Deferred - see `spec.md`. The picker does not walk: `listProjects` lists
  `projects/` and reads one manifest each, and never descends into `assets/`.
- **Importing the demo from a URL.** That is a URL import of the demo published in `dist/`, in
  tranche 3, and it is what finally retires `src/storage/seedDemoProject.ts`. Until then the Add demo
  project button above calls that seed directly - the demo is a local write, not an import.

## Comments

**Landed 2026-09-05**, on `claude/project-library`. `src/picker/` holds the view; `src/index.html`
gained `#vn-picker` and `#vn-session` and `src/index.ts` swaps them; `src/storage/openProject.ts` is
deleted and `bootEditor` takes a directory. Covered by `test/browser/ProjectPicker.test.ts`,
including the round trip with the real boot underneath it.

Four things worth recording.

**`lastOpened` is a moment per project, and the list is ordered by `created` rather than by it.**
Two corrections, both 2026-09-05.

First, the field: the canvas draws "opened just now" / "opened 2 days ago" / "opened 5 days ago" on
three different rows, and one directory name cannot say that for three rows. `EditorState.lastOpened`
is `Record<string, string>` of ISO timestamps; the tranche 1 single-name shape is discarded on read
rather than migrated, which is what `editor.yaml` being defined as losable is for.

Second, the sort. **This ticket's "`lastOpened` descending" is superseded: the picker orders by
creation, oldest first.** A list that reorders itself under the author is the thing to avoid - every
trip back from a project reshuffled the rows, and the spatial memory of where each one sits is worth
more than having the likeliest one on top. Oldest-first is the strongest form of it: a new project
appends at the bottom and no existing row moves at all. The rows still carry their last-opened line,
so recency survives as information without being the sort.

Note what the canvas did and did not settle here, because it is easy to over-read: `Main` happens to
be drawn in recency order but `ManifestError` is drawn just-now / 5-days / 2-days, which is not any
order at all. The drawings pin the row's **label** and say nothing about the sort, so this is not a
departure from them.

`created` is recorded because OPFS will not supply it. Measured 2026-09-05: Chromium enumerates a
directory in descending codepoint order of the entry name, identically for two different creation
sequences over the same names, and puts a deleted-then-recreated name back in the same slot - so
there is no insertion component to read, and the standard defines no iteration order to rely on
anyway. `createProject` writes the date, so every way into the store is dated by construction, and
`forgetProject` takes both entries away on delete - otherwise the next project to reuse an id would
inherit its predecessor's date and its place in the list.

**`writeEditorState({ lastOpened })` landed in `bootEditor`, not in the picker.** The ticket says it
moves to "wherever the picker opens a project", and that is this: the boot is where the lock is
taken, so recording after it preserves the ordering property the lock exists for, and ticket 04 -
which reopens under a directory the picker never showed - gets it without having to remember.

**One acceptance criterion is 03's by construction.** "First run shows an empty picker offering New
project and Add demo project" cannot be met by a ticket whose Not-in-scope section says "Making or
deleting a project. Ticket 03." The empty picker ships offering **Add demo project**, which is what
keeps first run good on its own - the story is one click away. New project joins it in 03.

**A stopped picker paints nothing, whether the render was in flight or is asked for afterwards.**
Both happen: the host stops it the moment a project opens, and the store walk it was stopped in the
middle of resolves later. One-way, like every other teardown here.

**The layout is the canvas's, and it was built from `design.md`'s prose first.** That was a mistake
worth recording: `design.md` says outright that the canvas is the pixels and that where the two
disagree the canvas is newer. The first implementation of this ticket invented a layout from the
reasoning alone and got the header, the panel, the placement of both actions, the row's third line
and the refusal banner's home all differently. Corrected in the same branch. **Read the canvas before
building anything it draws** - it had also grown two artboards nobody had mentioned, `NewProject` and
`NewProjectTaken`, which are ticket 03's.

**The view swap shipped broken, and the fix is a seam as much as a reorder.** Revealing `#vn-session`
only *after* `bootEditor` returned meant the whole renderer was constructed inside a `hidden`
subtree: `BackgroundRenderer`, `SpriteRenderer` and `FreeformTextRenderer` all measure the root in
their constructors, so the background canvas came out 0x0 and never painted and every sprite and
freeform box was positioned against a scene of zero. Nothing threw.

Nothing caught it because the swap was in `src/index.ts`, which self-boots on import and cannot be
imported by a test - the same reason `editorBoot.ts` was lifted out of there in tranche 1, applied to
new logic and then forgotten. It is now `src/appShell.ts`, `test/browser/AppShell.test.ts` mounts the
real two-div markup **with its `hidden`** and asserts the stage has a size and paints, and
`DomRenderer` logs when its root measures zero. Note the second gap the suite had: every browser test
mounts through `createVnRoot`, which appends a sized `#vn-div` straight to a visible `body`, so no
existing test could have seen this whatever it asserted.
