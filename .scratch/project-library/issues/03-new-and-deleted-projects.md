# 03: New projects, and deleting one

Status: ready-for-agent

Blocked by: 02 (the project library).

## What to build

An author can make a project and destroy one, from the picker page that ticket 02 draws.

Amended 2026-09-05: written when the library was a panel inside a booted editor. Both buttons now sit
on the picker, with **no project open and no lock held** in this tab - which changes delete
substantially and gives the dialogs a different home. `design.md` has the shape.

## New

Take an id, validate it, `createProject(id)`, then **open it** - lock, boot, `lastOpened` - through
ticket 02's second half. Not a "switch": there is no session to switch from, so only the choose-and-
boot half of that path applies, never the teardown half.

New project is one of the two ways to leave the front door without picking an existing row (rename is
the other, in 04). Add demo project is deliberately not: it populates the library and stays put.

**A refused lock is possible even here.** Another tab can hold `projects/<id>/` if that id was
just deleted and re-made, or if two tabs race the same new id. On refusal the project is created but
not opened, the author stays on the picker with the row present, and the page says why - the same
surface ticket 02 uses for a refused pick.

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

**Take the lock on what is about to be deleted, and refuse if it is held.** This replaces the
close-it-first mechanism this ticket originally described, which has no trigger any more: on the
picker nothing is open, there is no live storer to flush into a directory being removed, and this tab
holds nothing. What survives is the case that was never written down - the project is open **in
another tab** - and that is a lock refusal, not a close. Say so on the picker and delete nothing.

This is deliberately the same policy ticket 05 works out for its own delete, and for the same reason:
a tree another tab is writing into must not be removed underneath it. Take it there rather than
inventing a second one.

**The author stays on the picker afterwards.** "Land the author in another project" was written for a
panel inside an editor; from the front door there is nothing to land in, and auto-opening something
because you deleted something else is not a thing to want.

Deleting the **last** project leaves an empty picker. Nothing re-seeds it: since ticket 02 there is no
automatic seed at all, only the **Add demo project** button, which reappears the moment the demo is
gone. So the empty state offers both a new project and the demo, and an author who deleted everything
on purpose can get the story back - which is a better answer than the one this paragraph used to give,
where the empty state was survivable only because it was hard to reach.

## The dialog surface

This ticket introduces the confirm-and-prompt surface, and ticket 04's rename dialog reuses it. Not
`window.confirm` and `window.prompt`: an id needs its validation message beside the field it belongs
to, and `ROUGH_EDGES.md` already has the player's three browser dialogs down as a smell to move away
from rather than a pattern to copy.

**It is `src/chrome/`'s, not the editor's** (ticket 00 decides the home, this ticket builds it). It
has to work in two hosts: these dialogs open over the picker with no editor mounted, while 04's
rename fires on manifest blur *inside* one. Calling it "the editor's own" was true when the library
was a panel and would now rule out half its callers.

## Acceptance criteria

- [ ] New project takes an id, creates it, and opens it
- [ ] An id the manifest schema rejects is refused with the schema's own message, and nothing is
      created
- [ ] An id that already names a project is refused rather than overwriting it
- [ ] A newly created project opens on a story that parses clean - zero errors from both the manifest
      parser and the script parser over what was written
- [ ] Delete asks for confirmation and says the project cannot be recovered
- [ ] Deleting a project another tab holds is refused, says so, and removes nothing
- [ ] After a delete the author is still on the picker
- [ ] Deleting the last project leaves an empty picker offering both New project and Add demo project
- [ ] A new project whose lock is refused is created but not opened, and the author stays on the
      picker with the row present
- [ ] The dialogs are `src/chrome/`'s, not `window.confirm` or `window.prompt`, and the same surface
      serves the picker and the editor

## Not in scope

- **Duplicating a project.** A real feature, and the design doc places it here rather than as a
  checkbox on the rename dialog - but nothing needs it yet, and ticket 04's recursive copy is what it
  would be built on.
- **Rename.** Ticket 04.
