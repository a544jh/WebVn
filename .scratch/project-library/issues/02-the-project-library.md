# 02: The project library

Status: ready-for-agent

Blocked by: 01 (closing a project and opening another), 00 (the chrome's font and icons).

## What to build

An author can see the projects they have and open one, without the console. The picker is **its own
page, shown before the editor boots**: it lists what `listProjects()` enumerates and opens whichever
is chosen. The editor gains a **Back to projects** button in its upper left, which is the way back.

Amended 2026-09-05 - this was first specified as a panel in the editor's chrome. `design.md` holds
the drawings and the reasoning; three things below follow from the change.

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

## Switching

A switch is a **full teardown and remount through the boot path**, never a live swap. `VnPlayer`,
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

That takes half of `chooseProject` away and leaves the other half, which is the part worth noticing
before starting. Its two jobs today (`src/storage/openProject.ts`) are *which directory* -
`lastOpened`, else the first listed - and *is the library empty, seed the demo*. The author picking
replaces the first. **The second still has to happen, and it has to happen before the picker
renders**, or first run shows an empty list, which the spec's note on the demo seed says is worse
than today.

That reopens an ordering the current comment settles neatly and this ticket does not: `chooseProject`
writes nothing precisely so a refused tab cannot have seeded a directory on its way to being refused,
and the seed itself is a write that `claimProject` performs *after* the lock. With no project chosen
yet there is no obvious lock to be holding when an empty library is seeded. Resolve it explicitly -
seeding under the demo directory's own lock and releasing, or seeding only once the author picks -
rather than letting `editorBoot.ts:77` keep calling a function whose contract has changed underneath
it.

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
- [ ] `lastOpened` names the project opened, and orders the list - but a cold boot lands on the
      picker whatever it says
- [ ] First run with an empty library still shows the seeded demo in the list, not an empty picker
- [ ] The picker renders in the chrome vocabulary ticket 00 lands - Source Sans 3, Lucide icons - and
      the VN stage behind the editor is untouched

## Not in scope

- **Making or deleting a project.** Ticket 03. This one lists and switches.
- **Renaming.** Ticket 04, and its trigger is the manifest rather than this panel.
- **The confirm surface.** Ticket 03's, and it now appears over the picker page rather than in the
  editor's chrome. That is a venue change, not a design.
- **A "load the demo" button.** That is a URL import of the demo published in `dist/`, in tranche 3.
  Until then `src/storage/seedDemoProject.ts` still seeds the demo when the library is empty at boot,
  so first run is unchanged by this ticket - see the spec's note on why the seed survives it.
- **Per-project size.** Ticket 06, which adds a column to what this one draws.
