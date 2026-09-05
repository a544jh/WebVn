# 03: New projects, and deleting one

Status: ready-for-agent

Blocked by: 02 (the project library).

## What to build

An author can make a project and destroy one, from the library that ticket 02 draws.

## New

Take an id, validate it, `createProject(id)`, then switch to it through ticket 02's path.

**The id is validated by reusing the manifest schema's rule**, through the `validateProjectId` the
parser already exports - and the message shown is the schema's own. A second copy of a
filesystem-safety rule is a copy that drifts, and this one has to hold for the OPFS directory name,
the export filename and the localStorage key suffix at once.

`createProject` with no files already mints a **valid** project rather than an empty one: a manifest
declaring `formatVersion`, the id and a title, and a script holding one narrator line. An author's
first frame is a working story rather than a red gutter, which is the whole reason that call mints
rather than writes nothing.

An id that is already taken is refused rather than written over. `createProject` writes into
`projects/<id>/` unconditionally, so this check belongs here - and "make a new project on top of an
existing one" is not a thing anyone asked for, unlike the deliberate overwrite ticket 04 confirms.

## Delete

Ask first, and say the project cannot be recovered - which is plainly true right now, because there
is no export yet. `deleteProject` removes the tree.

Deleting the **open** project closes it first: its storer would otherwise flush into a directory that
is being removed, and its lock is still held. Close, delete, then land the author somewhere - another
project, or the empty state below.

Deleting the **last** project leaves an empty library within the session. The demo seed only runs at
boot, so it does not quietly come back; the empty state offers a new project and does not pretend
otherwise. That is the state the design doc calls the worst possible introduction to an authoring
tool, and it is survivable here only because reaching it takes deleting everything on purpose - a
first run still gets the demo.

## The dialog surface

This ticket introduces the editor's own confirm-and-prompt surface, and ticket 04's rename dialog
reuses it. Not `window.confirm` and `window.prompt`: an id needs its validation message beside the
field it belongs to, and `ROUGH_EDGES.md` already has the player's three browser dialogs down as a
smell to move away from rather than a pattern to copy.

## Acceptance criteria

- [ ] New project takes an id and creates it, and the author lands in it
- [ ] An id the manifest schema rejects is refused with the schema's own message, and nothing is
      created
- [ ] An id that already names a project is refused rather than overwriting it
- [ ] A newly created project opens on a story that parses clean - zero errors from both the manifest
      parser and the script parser over what was written
- [ ] Delete asks for confirmation and says the project cannot be recovered
- [ ] Deleting the open project closes it before the tree is removed, and leaves the author in
      another project
- [ ] Deleting the last project leaves an empty library that offers a new project
- [ ] The dialogs are the editor's own, not `window.confirm` or `window.prompt`

## Not in scope

- **Duplicating a project.** A real feature, and the design doc places it here rather than as a
  checkbox on the rename dialog - but nothing needs it yet, and ticket 04's recursive copy is what it
  would be built on.
- **Rename.** Ticket 04.
