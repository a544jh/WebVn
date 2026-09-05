import { parse, stringify } from "yaml"
import { parseManifest, validateProjectId } from "../yamlParser/parseManifest"
import { listDirectories, opfsRoot, readBlob, readText, removeRecursive, writeFile } from "./opfs"

// Project semantics over the OPFS primitives: where a project's files live, what counts as a
// project, and how one is read and written. design-docs/PROJECT_STORAGE.md, "Layout" and "Multiple
// projects".
//
// The layout, written from the first commit even though the picker that needs it is not built yet -
// the doc's own sequencing rule is "build the layout for many, ship the UI for one", which is what
// lets the picker arrive later without a migration:
//
//   projects/
//     <project-id>/
//       manifest.yaml
//       script.yaml
//       assets/
//         backgrounds/<file>
//         sprites/<actor>/<file>
//         audio/<file>
//   editor.yaml
//
// Everything under `assets/` is exactly the paths src/domRenderer/assetPaths.ts builds, which is
// what lets a project directory, a published folder and an export archive be the same shape.
// Everything above it is the project describing itself, and that is the room the wrapper keeps:
// export's README.txt, and the N script files design-docs/SCRIPT_INCLUDES.md will put in a project,
// land there without becoming ambiguous with media.
//
// This module may import from src/yamlParser/ - neither touches the DOM, and core/ stays free of
// both.

const PROJECTS = "projects"
const MANIFEST_FILE = "manifest.yaml"
const SCRIPT_FILE = "script.yaml"
// Beside projects/, not inside one: it is the editor's bookkeeping rather than project data, and
// must not travel in an export.
const EDITOR_FILE = "editor.yaml"

// One project as enumeration found it. A summary type rather than a list of ids, because the
// directory and the id can disagree and a store that returned ids would be quietly asserting an
// invariant it cannot check.
//
// **Enumeration is the truth about what exists**: listProjects walks projects/, and there is no
// index file, ever - a crash between creating a directory and updating an index leaves the two
// disagreeing, and a directory listing cannot lie.
//
// **The manifest is the truth about what a project is**: the id in manifest.yaml is the project's
// identity, never the directory name and never an archive filename. When the two disagree the fix
// is always to rename the directory to match the manifest, never to rewrite the manifest to match
// the directory - which is worth saying because the cheap implementation is the wrong one:
// rewriting a field is one line and moving a directory is not. Nothing here rewrites either.
export interface ProjectSummary {
  readonly directory: string
  // Null when the manifest is present but does not parse. That is an author's project with a typo
  // in it, not residue, so it stays listed - dropping it would make the picker the one place they
  // cannot go to fix it, and the editor opens a broken manifest perfectly well already (ADR 0002).
  readonly id: string | null
  readonly title: string | null
}

// The two text buffers a project is written in. Assets are not here: they are read one at a time
// through the resolver, on the render path, rather than loaded with the project.
export interface ProjectFiles {
  readonly manifestText: string
  readonly scriptText: string
}

// The editor's own bookkeeping. Deliberately without a schema version: this file is *defined* as
// losable - the read below treats a missing or unparseable one as empty, and the store degrades to
// enumeration without it - and that rule is the migration strategy. A future shape that does not
// parse under the current reader is discarded and rebuilt, which is exactly what a version field
// would have triggered. Durable versioning lives where it can survive, in each project's own
// manifest.
//
// Keep this type open for the fields tranche 2 adds - `pendingRename` above all - but do not add
// them speculatively: a field nothing writes is a field nobody can tell is dead.
export interface EditorState {
  // **When each project was last opened, ISO 8601, keyed by directory.** A map rather than one
  // name, because the picker draws "opened 2 days ago" against every row and one name can only
  // speak for one of them. A single `lastOpened: <directory>` was what tranche 1 wrote, when there
  // was one project and the field had nothing to decide; the read below discards that shape rather
  // than migrating it, which is exactly what this file being defined as losable is for.
  readonly lastOpened?: Record<string, string>
}

// The store addresses one root rather than taking a directory per call. This is the one place the
// layer departs from `opfs.ts`'s "every function takes the directory handle it works under, so
// nothing here holds global state", and the setter below exists for the browser suites, which share
// one origin and run their files in parallel, so each needs the store pointed somewhere of its own.
//
// The departure is a cost decision, not an impossibility - an earlier version of this comment
// claimed a root could not be threaded as far as `OpfsAssetResolver`, and that was wrong. It can:
// the resolver takes a second constructor argument and `bootEditor` passes one down. Counted, that
// is an optional `root` on the ten functions below, six more signatures accepting and forwarding it
// (`OpfsAssetResolver`, `ProjectStoring`, `bootEditor`, `ProjectPicker`, `seedDemoProject`) and
// nine call sites - to carry a parameter nothing but a test ever passes.
//
// It would also not be safer. Optional, it defaults back to the real root, so a test that forgets
// to pass it writes to the real OPFS exactly as a test that forgets `clearOpfsStore` does today;
// required, it lands in every production call site, which is worse. And this variable does not leak
// between suites the way a shared singleton would: the browser runner gives each test file its own
// module instance, which is measurable in the three distinct tags a logging patch prints.
//
// What would settle it the other way is turning off parallel test files, which deletes the seam
// outright by letting every suite share the real root. Timed 2026-09-05: the browser project goes
// from 13.7s to 47.1s, and the fast gate is the thing people run before every commit. If that ever
// stops being true, revisit this.
let root: () => Promise<FileSystemDirectoryHandle> = opfsRoot

export const setStoreRoot = (dir: () => Promise<FileSystemDirectoryHandle>): void => {
  root = dir
}

const projectPath = (directory: string, file: string): string => `${PROJECTS}/${directory}/${file}`

// What exists, by walking projects/ - never by reading an index. Each manifest found is parsed for
// its id and title; manifests are small and a personal library is a handful of them, so this is not
// worth caching, and a cache would be the index this module refuses to have.
export const listProjects = async (): Promise<ProjectSummary[]> => {
  const dir = await root()
  const directories = await listDirectories(dir, PROJECTS)
  const summaries: ProjectSummary[] = []
  for (const directory of directories) {
    // A directory with no manifest is not a project with a missing name - it is not a project. It
    // is the residue a crashed rename or import leaves, and the rename ticket's sweep deletes it.
    const text = await readText(dir, projectPath(directory, MANIFEST_FILE)).catch(() => null)
    if (text === null) continue
    const [manifest] = parseManifest(text)
    summaries.push({ directory, id: manifest?.id ?? null, title: manifest?.title ?? null })
  }
  return summaries
}

// Addressed by directory, not by id - and the parameter is named for it. The two agree in every
// healthy project and the whole rename ticket exists to restore them when they do not.
export const readProject = async (directory: string): Promise<ProjectFiles> => {
  const dir = await root()
  const [manifestText, scriptText] = await Promise.all([
    readText(dir, projectPath(directory, MANIFEST_FILE)),
    readText(dir, projectPath(directory, SCRIPT_FILE)),
  ])
  return { manifestText, scriptText }
}

// Put a project into the store, from text that already exists: the demo seed, and later an import.
// `mintProject` below is the same call with text this module writes, so there is one code path for
// "put a project into the store" rather than two.
//
// The manifest is written **first**, and that ordering is load-bearing in two places: a directory
// with no manifest is not a project, so a project being made must never present as the residue a
// crashed rename leaves. (A rename's copy writes the manifest *last*, for the mirror-image reason -
// it must not commit early.)
//
// This is the one place an id is validated, because it is the one place an id becomes a directory
// name. It reuses the manifest schema's rule rather than restating it.
export const createProject = async (id: string, files: ProjectFiles): Promise<void> => {
  const problem = validateProjectId(id)
  if (problem !== null) throw new Error(`"${id}" cannot name a project: it ${problem}`)

  const dir = await root()
  await writeFile(dir, projectPath(id, MANIFEST_FILE), files.manifestText)
  await writeFile(dir, projectPath(id, SCRIPT_FILE), files.scriptText)
}

// A brand-new project, under the title its author typed. **Valid, not empty**: a genuinely empty
// script.yaml has no `story` key, which parseStory reports as an error, so a new project would open
// with a red gutter as its first impression. One narrator line parses clean and gives the author a
// working story to edit.
export const mintProject = (id: string, title: string): Promise<void> => createProject(id, mintedFiles(id, title))

// **Serialized rather than interpolated**, and that is a fix rather than a style. `validateProjectId`
// accepts `true`, `false` and `null` - lowercase letters, starting with a letter, not Windows device
// names - and YAML reads all three as scalars rather than strings, so an interpolated `id: true`
// produced a manifest that does not parse: exactly the red gutter this function exists to avoid.
// (Measured 2026-09-05 against this repo's own parser. `no`, `on` and `y` are safe, because the
// library is YAML 1.2 rather than 1.1.) The title is worse, being free text the author typed: a
// quote, a colon or a newline in it would break any hand-rolled quoting. `stringify` knows all of
// those rules and this module does not have to.
const mintedFiles = (id: string, title: string): ProjectFiles => ({
  manifestText: stringify({ formatVersion: 1, id, title }),
  scriptText: "story:\n  - Your story starts here.\n",
})

export const deleteProject = (directory: string): Promise<void> =>
  root().then((dir) => removeRecursive(dir, `${PROJECTS}/${directory}`))

// The two buffers are written separately because the editor stores them separately: one debounce
// per buffer, and a manifest edit does not rewrite the script.
export const writeScript = (directory: string, text: string): Promise<void> =>
  root().then((dir) => writeFile(dir, projectPath(directory, SCRIPT_FILE), text))

export const writeManifest = (directory: string, text: string): Promise<void> =>
  root().then((dir) => writeFile(dir, projectPath(directory, MANIFEST_FILE), text))

// One file inside a project, addressed by its path within the project - `assets/backgrounds/a.png`,
// which is exactly what src/domRenderer/assetPaths.ts builds. The editor's AssetResolver reads
// through this, so the projects/<directory>/ layout stays this module's business rather than being
// re-spelled on the render path.
export const readProjectFile = async (directory: string, path: string): Promise<Blob> =>
  readBlob(await root(), projectPath(directory, path))

export const writeProjectFile = async (directory: string, path: string, data: Blob | string): Promise<void> =>
  writeFile(await root(), projectPath(directory, path), data)

// A hint, not a source of truth. Anything unreadable, unparseable or the wrong shape reads as empty
// and the caller falls back to enumeration - see EditorState for why that is the whole versioning
// story for this file.
export const readEditorState = async (): Promise<EditorState> => {
  const text = await root()
    .then((dir) => readText(dir, EDITOR_FILE))
    .catch(() => null)
  if (text === null) return {}
  let parsed: unknown
  try {
    parsed = parse(text)
  } catch (e) {
    return {}
  }
  if (typeof parsed !== "object" || parsed === null) return {}
  const lastOpened = (parsed as Record<string, unknown>).lastOpened
  if (typeof lastOpened !== "object" || lastOpened === null) return {}
  // Entry by entry, so one unreadable value does not cost the rest. A directory that is no longer
  // there is left in - enumeration is the truth about what exists, and this only ever orders what
  // enumeration found.
  const opened: Record<string, string> = {}
  for (const [directory, at] of Object.entries(lastOpened as Record<string, unknown>)) {
    if (typeof at === "string") opened[directory] = at
  }
  return { lastOpened: opened }
}

// Note the *moment* a project was opened, merging rather than replacing: this file will hold a
// rename marker beside this field, and a caller that wrote the whole state would drop it.
export const recordOpened = async (directory: string): Promise<void> => {
  const state = await readEditorState()
  await writeEditorState({ ...state, lastOpened: { ...state.lastOpened, [directory]: new Date().toISOString() } })
}

export const writeEditorState = (state: EditorState): Promise<void> =>
  root().then((dir) => writeFile(dir, EDITOR_FILE, stringify(state)))
