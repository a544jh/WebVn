# Editing manifest.yaml in the editor

Status: needs-triage

The editor can author a script but not a project. `manifest.yaml` became a real document in
[#35](https://github.com/a544jh/WebVn/pull/35) and a symbol table in
[#36](https://github.com/a544jh/WebVn/pull/36) - it now decides the cast, every asset id, and the
project's identity - and there is still no way to change it without editing a file in the repo and
rebuilding. Filed 2026-08-28 from a shape sketched by the author; see the frontier at the bottom for
what is still open.

## The shape, as sketched

- A **second CodeMirror instance** for the manifest, beside the existing one for the script.
- **Tabs above the editor** switch between them. Crude CSS, no styling work: showing and hiding the
  two instances is all the tabs do.
- The manifest **applies on editor blur**, not on every keystroke.
- **Error handling as already documented** - `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md`.

## Why blur, and why that is not the script's blur

The script reparses constantly because a half-written script is still a story: `parseStory` always
returns a playable state. A half-written manifest is not a project. `parseManifest` returns
`[VnManifest | null, ParserError[]]`, so reparsing every keystroke would spend most of an edit with
no manifest at all, and the preview has to be seeded from *something*.

ADR 0002 already decided what happens, and named this ticket while doing it:

> When manifest editing reaches the editor, it cannot show a half-applied manifest the way it shows a
> half-parsed script. It has to render the errors and keep the last valid manifest, which is a
> different interaction from the script buffer's and should not be assumed to fall out of the
> existing one.

So: **on blur, parse; on success, swap in the new manifest and reload; on failure, mark the gutter and
keep the last valid one.** The editor holds the last valid manifest as state - which it already does,
just immutably (`private manifest: VnManifest`, set once in the constructor and never reassigned).

Note the ADR's last consequence: `ParserError` and `SourceLocation` are the currency for both parsers,
so the existing gutter machinery (`setErrorMarker`) works unchanged on manifest errors. The failure
modes differ; the reporting does not.

## What applying a manifest has to do

More than swapping the field. `parseDocument()` passes `this.manifest` into `parseStory`, so a new
manifest means:

1. **Reparse the script against it.** Actor ids and asset ids are resolved through the manifest, so
   the same script produces different errors under a different manifest - which is the point: fixing a
   typo'd asset id in the manifest should clear the error in the script.
2. **Reload assets.** `renderer.loadAssets(state)` walks the declarations. A newly declared or
   renamed file is not in the loader until this runs, and `DomRenderer`'s sub-renderers throw on an
   asset that resolves to a path nothing preloaded.
3. **Reseed and reload the story.** `seedState(manifest)` is what turns a manifest into a starting
   state, and the starting state is what a `VnPath` replays from.

Point 3 is the one with a real question in it - see the frontier.

## Two things that break, found while reading

**`makeMarker` queries the document, not its own editor.**

```ts
const height = document.querySelector(".CodeMirror-linenumber")?.clientHeight + "px"
```

Already flagged as a hack by its own comment. With one instance it happens to be right. With two it
returns whichever comes first in the DOM, and if that one is the hidden tab, `clientHeight` is `0` and
every gutter marker in the visible editor gets `height: 0px`. Scope the query to the instance's own
root before adding the second editor, or the tabs ship with invisible error markers.

**CodeMirror 5 mis-measures in a hidden container.** An instance constructed inside `display: none`
has no line height to measure, and one revealed by a class change does not re-measure on its own -
`.refresh()` on tab switch is the documented remedy. This is exactly the "crude CSS" plan's one sharp
edge, and it is why the tabs need a switch handler rather than pure CSS.

## Implementation notes

- **`demoStory.ts` does not export the manifest text.** It imports
  `demoManifestYaml from "../test-assets/manifest.yaml?raw"`, parses it, and exports only the parsed
  `demoManifest` and the raw `demoYaml`. The manifest buffer needs the raw text, so export it
  alongside - a one-line change, and the symmetry `demoYaml` already has.
- **`VnEditor`'s constructor takes the manifest.** Making it a mutable field with a setter is the
  smallest change; whether the second CodeMirror belongs inside `VnEditor` or beside it is an
  interface question, not a mechanism one.
- **`index.ts` seeds the player from `demoManifest`** before constructing the editor, and calls
  `editor.loadScript(demoYaml)` to boot. A manifest buffer means that boot loads two documents.
- The script buffer already has a `blur` handler (it re-syncs the position marker), so blur is an
  established event here, not a new concept.

## This is disposable, like find-in-file

`design-docs/EDITOR.md` migrates to CodeMirror 6, and its model is one `EditorState` per file swapped
with `view.setState()` - which is *also* what script includes need, and which `TODO` carries as
"editor multi-buffer (shared with includes)" under the CM6 migration. Two CodeMirror 5 instances with
a tab bar is a second implementation of that, thrown away by the migration.

That is an argument for keeping it crude, not for waiting:

- The manifest is unauthorable **today**, and the CM6 migration is an `L` behind item `T`.
- `TODO` already makes the same call for item `A` (find-in-file): *"Disposable - the CM6 migration
  deletes it - and there is no reason for it to wait behind anything."*
- The disposable part is genuinely small: two instances, a tab bar, and a show/hide. The part that
  survives the migration is the apply-on-blur behaviour and the keep-the-last-valid-manifest rule,
  which are about `parseManifest`'s contract rather than about CodeMirror.

So the recommendation is to build it now and expect the CM6 migration to delete the tab bar - but it
should be a deliberate choice, since it is the second disposable editor feature in a row.

## Not in scope

- **The CodeMirror 6 migration**, and multi-buffer proper. `design-docs/EDITOR.md`.
- **Autocompleting asset ids from the manifest.** `EDITOR.md`'s completion table wants exactly this,
  and it needs item `B` and the syntax tree first.
- **Where the manifest text is stored.** Today it is a `?raw` import of a file in the repo; the OPFS
  project store is what makes it editable-and-saved. `design-docs/PROJECT_STORAGE.md`.
- **Creating or renaming a project.** Editing the `id` field is a different thing from having a
  project rename flow, and the frontier below is about whether it may be edited at all.
- **Adding or uploading asset files.** This edits declarations, not the assets they point at, so a
  newly declared file that does not exist is a load failure and nothing here changes that.

## Frontier - open questions

**1. What does applying a manifest do to the current playthrough?** `goToLine` reloads the script with
`player.reloadStory(...)`, deliberately keeping the path so the choices made so far survive an edit. A
manifest change is different in kind: it changes `startingState`, and a `VnPath` is only meaningful
against the starting state it was recorded from. Keeping the path across a reseed means replaying old
actions from a new beginning. Options are to reload from the top and drop the path, to keep it and
accept that it may not replay, or to keep it only when the reseed is provably compatible - which
probably cannot be decided cheaply.

**2. May `id` be edited in-session, and what happens to saves when it is?** `id` is the save key
(`vn-save-<id>` per `PROJECT_STORAGE.md`, currently the hardcoded `"test"` in `index.ts`). Editing it
in a live editor is a project rename with no rename flow behind it. The cheap answer is that it is
allowed and saves simply key differently from then on; the honest one may be that the editor should
refuse it until project rename exists.

**3. Does an invalid manifest block anything besides itself?** The last valid manifest keeps the
preview alive, so the script buffer keeps working. But the author now sees a preview built from a
manifest that is not what is on screen in the other tab, with no indication of that beyond the error
markers on a tab they may not be looking at. Whether the tab bar needs an error state is a small
question with a real answer.

**4. Is there a test to write, or is this hand-verified like the rest of the editor?** `EDITOR.md` is
blunt that nothing mounts `VnEditor` and every editor change is verified by hand - that is item `T`.
Apply-on-blur with a keep-the-last-valid rule is behavioural rather than DOM-shaped, so it is the kind
of test that would survive the CM6 rewrite. It may be the cheapest place to start item `T`.

## See also

- `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` - the error-handling rule, and the
  consequence that named this ticket
- `design-docs/EDITOR.md` - the CM6 migration and multi-buffer this duplicates and is deleted by
- `design-docs/PROJECT_STORAGE.md` - where the manifest text eventually lives
- `TODO` - item `A` for the disposable-feature precedent, item `T` for the missing editor tests
- `src/editor/editor.ts`, `src/index.ts`, `src/demoStory.ts`, `src/yamlParser/parseManifest.ts`
