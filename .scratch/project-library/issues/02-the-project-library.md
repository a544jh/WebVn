# 02: The project library

Status: ready-for-agent

Blocked by: 01 (closing a project and opening another).

## What to build

An author can see the projects they have and open a different one, without the console. A panel in
the editor's chrome lists what `listProjects()` enumerates, marks the one that is open, and switches
to whichever is chosen.

This is the first ticket in the tranche an author can see, and the one that makes `lastOpened` do
work: until now there has been exactly one project to open, so the store's "`lastOpened`, else the
first listed" has been a rule with nothing to decide.

## What the list shows

Title where the manifest parses, the directory name where it does not. **A project whose manifest
does not parse must be listed**, with whatever the store reports: it is an author's project with a
typo in it, and the library is the one place they would go to open it and fix it. That is why
`ProjectSummary` carries a nullable id rather than the store returning a list of ids, and hiding such
a project here would undo the reason.

The open project is marked. Enumeration is the truth about what exists, so the list is a walk of
`projects/` every time it is shown - there is no index file, ever.

## Switching

A switch is a **full teardown and remount through the boot path**, never a live swap. `VnPlayer`,
`DomRenderer` and the resolver never learn that other projects exist; they are rebuilt, on a state
seeded from the chosen project's own manifest, which is what carries the save key with them.

**The new lock is taken before the old project is closed.** A switch that closes first and is then
refused - the chosen project is already open in another tab - would leave the author with nothing
mounted and their work already put down. The two locks are keyed on different directories, so holding
both across the swap is not a conflict. This means `bootEditor` grows a way to be told which
directory to open: `chooseProject` stays what a cold boot uses, and a switch names its directory and
gets the refusal back before anything is torn down. Ticket 04 reuses this, since a rename reopens the
session under a directory the old lock does not cover.

Order, then: take the new lock, `close()` the old session (which flushes it), boot the new one, write
`lastOpened`. A refusal at the first step changes nothing and says so.

Switching to the project that is already open does nothing.

## Acceptance criteria

- [ ] The library lists every project the store enumerates, with its title
- [ ] A project whose `manifest.yaml` does not parse is listed under its directory name, and opening
      it works - the buffers hold their real text and the manifest gutter marks the problem
- [ ] The open project is marked as such
- [ ] Choosing another project opens it with its own player, renderer, editor, storer and resolver,
      and its own save key
- [ ] Unstored edits in the project being left are written before it closes
- [ ] A switch to a project open in another tab is refused, and the author is left in the project
      they were already in, still able to type
- [ ] `lastOpened` names the project switched to, and a reload opens that one
- [ ] Choosing the already-open project is a no-op

## Not in scope

- **Making or deleting a project.** Ticket 03. This one lists and switches.
- **Renaming.** Ticket 04, and its trigger is the manifest rather than this panel.
- **A "load the demo" button.** That is a URL import of the demo published in `dist/`, in tranche 3.
  Until then `src/storage/seedDemoProject.ts` still seeds the demo when the library is empty at boot,
  so first run is unchanged by this ticket - see the spec's note on why the seed survives it.
- **Per-project size.** Ticket 06, which adds a column to what this one draws.
