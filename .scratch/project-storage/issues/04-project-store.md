# The project store

Status: ready-for-agent

Project semantics over ticket 03's primitives: where a project's files live, what counts as a
project, and how one is read and written. `design-docs/PROJECT_STORAGE.md`, "Layout" and "Multiple
projects". Needs 03.

## Layout

```
projects/
  <project-id>/
    manifest.yaml
    script.yaml
    assets/
      backgrounds/<file>
      sprites/<actor>/<file>
      audio/<file>
editor.yaml
```

Everything under `assets/` is exactly the paths `src/domRenderer/assetPaths.ts` builds once ticket 01's
first step lands, which is what lets a project directory, a published folder and an export archive all
be the same shape. Everything *above* it is the project describing itself, and that is the room the
wrapper exists to keep: export's `README.txt`, and the N script files
`design-docs/SCRIPT_INCLUDES.md` will put in a project, land there without becoming ambiguous with
media.

`editor.yaml` sits beside `projects/`, not inside one, because it is the editor's bookkeeping rather
than project data and must not travel in an export. For this ticket it holds one field:

```yaml
lastOpened: my-story
```

Keep the type open for the fields tranche 2 adds (`pendingRename` above all) but do not add them
speculatively - a field nothing writes is a field nobody can tell is dead.

## `src/storage/projectStore.ts`

```ts
export interface ProjectSummary {
  directory: string          // the directory name - what enumeration found
  id: string | null          // the manifest's id, or null if the manifest does not parse
  title: string | null
}

export interface ProjectFiles {
  manifestText: string
  scriptText: string
}

export const listProjects = (): Promise<ProjectSummary[]>
export const readProject = (directory: string): Promise<ProjectFiles>
export const createProject = (id: string, files: ProjectFiles): Promise<void>
export const deleteProject = (directory: string): Promise<void>
export const writeScript = (directory: string, text: string): Promise<void>
export const writeManifest = (directory: string, text: string): Promise<void>

export const readEditorState = (): Promise<EditorState>
export const writeEditorState = (state: EditorState): Promise<void>
```

Reads and writes are addressed by **directory**, not by id, and the parameter is named `directory`
everywhere for that reason. The two agree in every healthy project and the whole rename ticket exists
to restore them when they do not, so a store that took an `id` would be quietly asserting an
invariant it cannot check.

## Two truths, and they answer different questions

Both come from the design doc and they are easy to conflate:

- **Enumeration is the truth about what exists.** `listProjects` walks `projects/`. There is no
  `projects.yaml` index, ever - a crash between creating a directory and updating an index leaves the
  two disagreeing, and a directory listing cannot lie. If an index is ever added for speed, it is a
  cache that is rebuilt whenever it disagrees with the tree, and it is not needed at the scale of a
  personal library.
- **The manifest is the truth about what a project is.** The id in `manifest.yaml` is the project's
  identity - never the directory name, never an archive filename. When they disagree the fix is
  always to rename the directory to match the manifest, never to rewrite the manifest to match the
  directory. Say so in a comment where `ProjectSummary` is declared, because the cheap
  implementation is the wrong one: rewriting a field is one line and moving a directory is not.

## A manifest that does not parse is still a project

The doc says a directory with no manifest "is not a project with a missing name, it is not a
project", and `listProjects` skips those - they are the residue a crashed rename or import leaves,
and the sweep in the rename ticket is what deletes them.

**A manifest that is present but does not parse is a different case, and must not be skipped.** That
is an author's project with a typo in it, and dropping it from the listing would make the picker the
one place they cannot go to fix it - the editor opens broken manifests perfectly well already, since
ADR 0002's whole design is "keep the last valid manifest and mark the gutter". So `ProjectSummary`
carries `id: null, title: null` and the picker shows the directory name. This is the reason
`listProjects` returns a summary type at all rather than a list of ids.

## Validating an id

`createProject` validates against the manifest schema's rule, and does it by **reusing the schema**,
not by restating the pattern. `ID_PATTERN` and `WINDOWS_RESERVED` are module-private in
`src/yamlParser/parseManifest.ts:16-24`; export the composed `idSchema` (or a
`validateProjectId(id): string | null` wrapper around it) and call that. A second copy of a
filesystem-safety rule is a rule that drifts, and this one has to hold for the OPFS directory, the
export filename and the localStorage key at once.

## Reading a title means parsing

`listProjects` parses each `manifest.yaml` it finds, through `parseManifest`. Manifests are small and
a personal library is a handful of them, so this is not worth caching - and caching it would be the
index this ticket refuses to have. `src/storage/` may import from `src/yamlParser/`; neither touches
the DOM, and `core/` stays free of both.

## Tests

`test/browser/`, over ticket 03's `clearOpfs()` scratch directory.

- create, list, read round-trip: a created project appears in the listing with the id and title its
  manifest declares
- a directory with no `manifest.yaml` is not listed
- a directory whose `manifest.yaml` does not parse **is** listed, with a null id and title
- a directory whose manifest declares a different id is listed with both, and nothing is rewritten -
  read it back afterwards and assert the manifest text is byte-identical
- `createProject` refuses `MyStory`, `con`, `..` and the empty string, with the message the schema
  gives
- `deleteProject` removes the tree, and the project stops being listed
- editor state round-trips, and a missing or unparseable `editor.yaml` reads as empty rather than
  throwing - it is a hint, not a source of truth, and the doc's recovery reasoning depends on losing
  it being survivable

## Not in scope

- **Rename.** Tranche 2. It is the only thing that resolves a directory/id disagreement, and its
  crash-safe four-step ordering plus the startup sweep need their own ticket.
- **The picker.** Tranche 2. This ticket ships the layout for many projects and no UI for choosing
  between them, which is the doc's explicit sequencing.
- **`SourceLoader`.** `readProject` is the shape it will be written over, but do not introduce the
  interface here with one caller and no second implementation; `design-docs/SCRIPT_INCLUDES.md` owns
  it.
- **Import, export, zip.** Separate effort.
