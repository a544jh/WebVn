# 03: New projects, and deleting one

Status: done

Blocked by: 02 (the project library).

## What to build

An author can make a project and destroy one, from the picker page that ticket 02 draws.

Amended 2026-09-05: written when the library was a panel inside a booted editor. Both buttons now sit
on the picker, with **no project open and no lock held** in this tab - which changes delete
substantially and gives the dialogs a different home. `design.md` has the shape.

## New

Take a title and an id, `createProject(id)`, then **open it** - lock, boot, `lastOpened` - through
ticket 02's second half. Not a "switch": there is no session to switch from, so only the choose-and-
boot half of that path applies, never the teardown half.

New project is one of the two ways to leave the front door without picking an existing row (rename is
the other, in 04). Add demo project is deliberately not: it populates the library and stays put.

**A refused lock is possible even here.** Another tab can hold `projects/<id>/` if that id was
just deleted and re-made, or if two tabs race the same new id. On refusal the project is created but
not opened, the author stays on the picker with the row present, and the page says why - the same
surface ticket 02 uses for a refused pick.

### Two fields: a title, and an id derived from it

**The title is what the author types.** It is the only one of the two the picker ever shows, and it
is unconstrained - "The Lighthouse Keeper", capitals, spaces and all.

**The id is derived from it and stays editable.** Slugified from the title as it is typed, until the
author edits the id field themselves, at which point it stops tracking - the usual behaviour, and the
only one that does not fight someone deliberately choosing an id.

Showing it rather than hiding it is deliberate. The id names the OPFS directory, the localStorage save
key and the export filename; it is not cosmetic, and changing it later is a rename (ticket 04) that
orphans saves made under the old one. An author who never looks at the field loses nothing, and one
who cares can set it now instead of paying for it later. The dialog says so beneath the field.

- **Validate with `validateProjectId`**, which the parser already exports, and show the schema's own
  message beside the field. A second copy of a filesystem-safety rule is a copy that drifts, and this
  one has to hold for the directory name, the export filename and the save key suffix at once. The
  slugifier is not a second copy - it is a *producer* whose output that rule then judges, so a title
  that slugifies to something invalid is caught by the one rule rather than by a second opinion.
- **A title that slugifies to nothing** - punctuation only, or a script with no ASCII - leaves the id
  field empty and the author fills it in. Do not invent one: a project called `project-1` because
  the slugifier gave up is worse than being asked.
- **An id that is already taken is refused rather than written over.** `createProject` writes into
  `projects/<id>/` unconditionally, so this check belongs here - and "make a new project on top of an
  existing one" is not a thing anyone asked for, unlike the deliberate overwrite ticket 04 confirms.

### Fix `mintProject` while you are here

`createProject`'s no-files form interpolates the id into YAML unquoted
(`src/storage/projectStore.ts`):

```ts
manifestText: `formatVersion: 1\nid: ${id}\ntitle: ${id}\n`,
```

`validateProjectId` accepts `true`, `false` and `null` - they are lowercase letters, start with a
letter, and are not Windows device names - and the `yaml` parser reads all three as scalars rather
than strings, so `z.string()` rejects them and **the manifest of a brand-new project does not parse**.
Measured 2026-09-05 against the repo's own parser: `id: true` yields a boolean, `id: null` yields
null, while `no`, `on` and `y` are safe because the library is YAML 1.2 rather than 1.1.

The comment above `mintProject` says its whole purpose is that an author's first frame is "a working
story rather than a red gutter". For those three ids it produces exactly a red gutter. Quote both
interpolations. It is one line and a test, and it is worth doing here rather than as a separate fix
because this ticket is what first lets an author choose the id.

This also settles what the minted `title:` holds: **the title the author typed**, quoted, rather than
a copy of the id. Copying the id is what makes the picker show `the-lighthouse-keeper` where the
design shows "The Lighthouse Keeper".

`createProject` with no files already mints a **valid** project rather than an empty one: a manifest
declaring `formatVersion`, the id and a title, and a script holding one narrator line. An author's
first frame is a working story rather than a red gutter, which is the whole reason that call mints
rather than writes nothing. It grows a title parameter here, since the author now supplies one.

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

- [ ] New project takes a title, derives an id from it, creates the project and opens it
- [ ] The derived id stops tracking the title once the author edits it
- [ ] The picker shows the title the author typed, not the id
- [ ] A title that slugifies to nothing leaves the id empty for the author to fill, and invents
      nothing
- [ ] An id the manifest schema rejects is refused with the schema's own message beside the field,
      and nothing is created
- [ ] A project created as `true`, `false` or `null` has a manifest that parses - the minted YAML
      quotes its values
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

## Comments

**Landed 2026-09-05**, on `claude/project-library`. `src/chrome/dialog.ts` is the surface,
`src/picker/newProjectDialog.ts` the one dialog with fields in it, and the two flows are on
`ProjectPicker`. Covered by `test/browser/ProjectPicker.test.ts` (new and delete end to end) and
`test/browser/chrome.test.ts` (the surface on its own). This also ticks ticket 02's one outstanding
criterion: the empty picker now offers both New project and Add demo project.

**The surface is `<dialog>` + `showModal()`.** The platform supplies the backdrop, the top layer, the
focus trap and Escape-to-dismiss, and every one of those is something a hand-rolled overlay in this
codebase would get subtly wrong. `openDialog` takes a `content` element and a `validate` hook; a
refused confirm shows its message and keeps what was typed. `confirmDialog` is the no-fields wrapper
that delete uses and that a rename's two dialogs will.

**`mintProject` serializes rather than interpolates.** The ticket asks for both interpolations to be
quoted; `stringify` from the `yaml` library does it instead, because the title is the harder half -
free text the author typed, where a quote, a colon or a newline breaks any hand-rolled quoting, and
the library already knows every one of those rules. `createProject` now *requires* files and
`mintProject(id, title)` is the call that makes a new project, so there is still one write path.
`test/browser/projectStore.test.ts` pins `true`/`false`/`null` and a title with YAML in it.

**The taken-id check is asked twice, on purpose.** Once inside the dialog's `validate`, which is what
puts the message beside the field, and once after it resolves and before the write - another tab can
create the id while the dialog is up, and `createProject` writes into `projects/<id>/`
unconditionally. The first is the UI; the second is what makes it true.

**Slugification folds accents rather than dropping them.** Without it a title spelled with a
diaeresis loses its first letter outright (`Ürsula's Tale` becomes `rsula-s-tale`). That is the
producer being better at its job, not a second rule about what an id may be - the one rule is still
`validateProjectId`, which judges whatever the slugifier hands it.

**The Id field's note was corrected after ticket 04 changed what it describes.** The design canvas
draws it as "Changing it later orphans saves made under the old one", and it was implemented
verbatim - correctly, at the time. Ticket 04 then made a rename carry the author's own saves to the
new id, which left this field warning about the one thing that no longer happens, in the one place an
author decides whether to care about the id at all.

It now reads "Names its folder, its saves and its export file. Renaming later brings your work along,
but breaks saves for anyone already playing a build you published." - the same two facts the rename
dialog states, in the same order and for the same reason: naming the half that survives is what lets
the half that does not land as information rather than as a scare.

**The canvas is behind on this string**, deliberately, and that is worth writing down given it is
otherwise binding for these pixels. A drawing cannot know what a later ticket changed underneath it.

