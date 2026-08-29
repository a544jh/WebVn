import { parse, stringify } from "yaml"
import { parseManifest, validateProjectId } from "../yamlParser/parseManifest"
import { listDirectories, opfsRoot, readText, removeRecursive, writeFile } from "./opfs"

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
  readonly lastOpened?: string
}

// The store addresses one directory rather than taking one per call, because none of its callers
// have a second one to pass. It is `opfsRoot` in the app; the browser suites point it at a scratch
// directory of their own, since they share one origin and run in parallel.
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

// Takes the files or mints them. The no-files form is what the picker's "new project" will call, and
// ticket 05's demo seed is the same call with different bytes - so there is one code path for "put a
// project into the store" rather than two.
//
// This is the one place an id is validated, because it is the one place an id becomes a directory
// name. It reuses the manifest schema's rule rather than restating it.
export const createProject = async (id: string, files?: ProjectFiles): Promise<void> => {
  const problem = validateProjectId(id)
  if (problem !== null) throw new Error(`"${id}" cannot name a project: it ${problem}`)

  const { manifestText, scriptText } = files ?? mintProject(id)
  const dir = await root()
  await writeFile(dir, projectPath(id, MANIFEST_FILE), manifestText)
  await writeFile(dir, projectPath(id, SCRIPT_FILE), scriptText)
}

// What a brand-new project holds. Valid, not empty: a genuinely empty script.yaml has no `story`
// key, which parseStory reports as an error, so a new project would open with a red gutter as its
// first impression. One narrator line parses clean and gives the author a working story to edit.
const mintProject = (id: string): ProjectFiles => ({
  manifestText: `formatVersion: 1\nid: ${id}\ntitle: ${id}\n`,
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
  return typeof lastOpened === "string" ? { lastOpened } : {}
}

export const writeEditorState = (state: EditorState): Promise<void> =>
  root().then((dir) => writeFile(dir, EDITOR_FILE, stringify(state)))
