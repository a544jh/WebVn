# 01: Renaming a project from its picker row

Status: needs-triage

Blocked by: nothing in code. Blocked in practice by a drawing: the design canvas `.scratch/project-library/design.md`
links is binding for pixels, and nothing on it draws a rename control on a row or the dialog behind it.

## Why

Two refusals shipped with tranche 4 tell the author to rename a project, and there is no rename they can
find:

- URL import's taken id: "… is already in your library, under cat-adventure. To import it, delete or
  rename the existing project."
- Add demo project's second press: "The demo was not added: WebVn Demo is already in your library, under
  webvn-demo. To add it, delete or rename the existing project."

Today renaming means opening the project, switching to the `manifest.yaml` tab, editing `id:`, leaving
the editor so the manifest is adopted, and confirming the rename that adoption offers. That works, and it
is what `.scratch/project-library/issues/04-renaming-a-project.md` built - but "rename it" in a banner
on the picker points at a gesture that starts somewhere else, four steps away. Raised in
`.scratch/published-folder/spec.md`, Out of Scope, "Renaming from the picker's rows", as its own ticket.

## What is already decided

None of this is new; it is the existing rename's rules, applied to a second entry point.

- **The directory follows the manifest's id, never the reverse.** A row rename is therefore a manifest
  edit - the new id written into `manifest.yaml` - followed by the same `renameProject(from, to,
  manifestText)` the session's rename calls. It is not a directory move with the manifest left behind.
- **The id edit is textual.** Round-tripping `manifest.yaml` through the parser eats the author's
  comments, so the `id:` line is replaced in place, as `VnEditor.revertManifestId` already does. That
  splice lives in the editor today; a row rename has no editor, so it moves to
  `src/yamlParser/manifestEdit.ts` - the one place a manifest is spliced - and `revertManifestId` calls
  it. It refuses rather than mangles, as `manifestEdit.ts` does everywhere: a flow-style manifest, or an
  `id:` not on a line of its own, cannot be renamed from the row.
- **The id is validated by the one rule**, `validateProjectId`, beside the field it belongs to, with the
  new-project dialog's note about what a rename costs (it carries the author's own saves, and breaks them
  for anyone playing a build published under the old id).
- **The ordering is the session rename's**, minus the parts that exist because a session is open: room
  check, then the overwrite question for a taken id (`confirmOverwritingProject`, "renaming"), then both
  locks, then `renameProject`, then `moveSaveData(from, to)`. From the picker nothing is open in this tab,
  so the source's lock is taken here, as delete takes it, and a project open in another tab is refused.
  `recoverProjects` already finishes a rename that crashes, whichever entry point started it.
- **It runs in the picker's `InTurn` queue**, with the busy state on the row's control, like export and
  delete.
- **A row whose manifest does not parse has no id to change**, so the control is disabled with the reason
  on the row, as export's is.

## Open questions

1. **Title as well as id?** The new-project dialog asks for both and slugifies one into the other. A title
   is not identity - changing it needs no rename at all, only a manifest edit - but an author renaming
   `webvn-demo` to keep their tinkered copy probably wants its title to stop saying "WebVn Demo" too.
2. **Where the shared half lives.** `AppShell.rename` holds the ordering today, interleaved with closing
   and reopening the session. Two entry points written separately would drift; the room check, the
   overwrite question, the locks, `renameProject` and `moveSaveData` want to be one function both call.
3. **The icon**, since the row's other two controls are icons (`upload`, `trash-2`) and the chrome's rule
   is icons on every tool or none. Lucide `pencil` or `pen-line` are the obvious candidates; the canvas
   decides.

## Acceptance criteria

- [ ] A rename control on each row, beside export and delete, as the canvas draws it.
- [ ] It asks for a new id beside a field that refuses an invalid one with the schema's own message.
- [ ] The project lands under the new directory with `id:` changed in its `manifest.yaml`, every other
      line - comments included - untouched, and its `created`, `lastOpened` and `exported` carried across.
- [ ] Its saves move to the new id.
- [ ] A taken id asks before destroying the project filed there; a project open in another tab is refused.
- [ ] A manifest that does not parse, or declares its id where no line can be replaced, disables or
      refuses the control rather than rewriting the file.
- [ ] Browser suite through the picker's DOM, with directory names unique to the suite - locks are
      origin-wide.
