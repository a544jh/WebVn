import { parse, stringify } from "yaml"
import { parseManifest, validateProjectId } from "../yamlParser/parseManifest"
import {
  copyTree,
  exists,
  listDirectories,
  opfsRoot,
  readBlob,
  readText,
  removeRecursive,
  walk,
  writeFile,
} from "./opfs"

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
  // **When each project came into the library**, same shape, and what the picker orders by.
  //
  // Recorded because OPFS will not tell us. Measured 2026-09-05: Chromium enumerates a directory in
  // descending codepoint order of the entry name, identically for two different creation sequences
  // over the same names, and puts a deleted-then-recreated name back in the same place - so there is
  // no insertion component to read, and the standard does not define an iteration order to rely on
  // anyway.
  //
  // Neither of these is an index: `listProjects` still walks `projects/` and this only ever answers
  // questions *about* what that walk found. A project missing from either map is a project this file
  // has nothing to say about, not a project that does not exist.
  readonly created?: Record<string, string>
  // A rename in flight. **One slot, not a field per project**: one project is open at a time under
  // its lock, so two renames cannot overlap, and "is a rename in flight" is one check rather than a
  // scan. Written before the copy and cleared after the source is gone; ticket 05's recovery is what
  // reads it.
  readonly pendingRename?: PendingRename
}

export interface PendingRename {
  readonly from: string
  readonly to: string
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

// Every directory under projects/, project or not. `listProjects` answers "what projects exist" and
// skips anything without a manifest; this answers "what is in there", which is what a sweep needs -
// the residue it removes is precisely what `listProjects` refuses to return.
export const listProjectDirectories = async (): Promise<string[]> => listDirectories(await root(), PROJECTS)

// **A manifest file, not a manifest that parses.** A directory with no manifest is not a project at
// all - it is what a crashed rename or, later, a crashed import leaves behind. One whose manifest
// does not parse is an author's project with a typo in it, and the whole store is built to keep that
// listable and openable.
export const isProject = async (directory: string): Promise<boolean> =>
  exists(await root(), projectPath(directory, MANIFEST_FILE))

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
  // After the files, because the files are the project and this is only a note about it - and here
  // rather than at each caller, so every way of putting a project into the store is dated by
  // construction: minting one, seeding the demo, and the import that will share this call.
  await note("created", id)
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

// Carry a project's bookkeeping to the directory it now lives under. Without this a renamed project
// has no recorded creation, which puts it in the undated bucket the picker sorts *first* - so
// renaming would send a project to the top of the library.
const moveProjectRecords = async (from: string, to: string): Promise<void> => {
  const { lastOpened = {}, created = {}, pendingRename } = await readEditorState()
  if (created[from] !== undefined) created[to] = created[from]
  if (lastOpened[from] !== undefined) lastOpened[to] = lastOpened[from]
  delete created[from]
  delete lastOpened[from]
  await writeEditorState({ lastOpened, created, pendingRename })
}

// **The directory follows the identity the manifest declares**, which is the only direction this
// runs in: when the two disagree the fix is always to move the directory, never to rewrite the id to
// match it. Rewriting a field is one line and moving a directory is not, which is exactly why the
// cheap answer has to be refused in writing.
//
// The ordering is the whole of this function, and every step of it exists to make each crash state
// recoverable by ticket 05's reconcile:
//
// 0. Delete the destination if the caller has confirmed an overwrite - **before** the marker, so
//    "a directory with no manifest is garbage" holds throughout and the destructive step is up front
//    rather than interleaved with the copy.
// 1. Write the marker. From here on a crash leaves something a later boot can finish.
// 2. Copy everything but the manifest.
// 3. Write the destination's manifest. **This single atomic write is the commit point** - an OPFS
//    write is already atomic, so nothing needs layering on top of it. Before it the destination has
//    no manifest and is therefore garbage; after it, it is a valid project. There is no third state.
// 4. Delete the source, then clear the marker and carry the bookkeeping across.
//
// The caller owns everything this cannot know: that the author agreed, that there is room, and that
// the destination's lock is held.
export const renameProject = async (from: string, to: string, manifestText: string): Promise<void> => {
  const dir = await root()

  await removeRecursive(dir, `${PROJECTS}/${to}`)
  await recordPendingRename({ from, to })

  await copyTree(dir, `${PROJECTS}/${from}`, `${PROJECTS}/${to}`, (path) => path === MANIFEST_FILE)
  await writeFile(dir, projectPath(to, MANIFEST_FILE), manifestText)

  await completeRename(from, to)
}

// The tail of a rename: the source goes, its bookkeeping moves, and the marker comes off.
//
// Its own function because **recovery finishes exactly this** when a rename is interrupted after the
// commit - so what a crashed rename becomes is what an uninterrupted one would have been, rather
// than a second implementation of the same three steps that could come to disagree with them.
//
// Every step is safe to repeat: removing a path that is already gone is not an error, and moving
// bookkeeping that has already moved finds nothing to move. Recovery may therefore run over a rename
// that got further than it looks.
export const completeRename = async (from: string, to: string): Promise<void> => {
  await removeRecursive(await root(), `${PROJECTS}/${from}`)
  await moveProjectRecords(from, to)
  await recordPendingRename(null)
}

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
  const parsed = text === null ? null : parseOrNull(text)
  // Both maps, always, however little the file had to say - a missing file, an unparseable one and a
  // valid one all read the same shape, so no caller has to tell those apart. They stay optional on
  // the type because a *writer* need not supply either.
  if (typeof parsed !== "object" || parsed === null) return { lastOpened: {}, created: {} }
  const record = parsed as Record<string, unknown>
  return {
    lastOpened: timestamps(record.lastOpened),
    created: timestamps(record.created),
    pendingRename: pendingRename(record.pendingRename),
  }
}

// A marker naming anything but two strings is not a marker. It is a hint about what to look for in
// the tree, and recovery re-verifies against the tree before acting on it, so a malformed one costs
// nothing to discard.
const pendingRename = (value: unknown): PendingRename | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const { from, to } = value as Record<string, unknown>
  return typeof from === "string" && typeof to === "string" ? { from, to } : undefined
}

const parseOrNull = (text: string): unknown => {
  try {
    return parse(text)
  } catch (e) {
    return null
  }
}

// Entry by entry, so one unreadable value does not cost the rest, and anything that is not a map of
// strings reads as empty - including `lastOpened: <directory>`, the single name tranche 1 wrote.
// Discarding that shape *is* the migration; see EditorState for why this file gets no version.
//
// A directory that is no longer there is left in rather than pruned on read: this is a hint file,
// and a read that writes is a read that races another tab doing the same.
const timestamps = (value: unknown): Record<string, string> => {
  if (typeof value !== "object" || value === null) return {}
  const found: Record<string, string> = {}
  for (const [directory, at] of Object.entries(value as Record<string, unknown>)) {
    if (typeof at === "string") found[directory] = at
  }
  return found
}

// Note the *moment* a project was opened, merging rather than replacing: this file holds two maps
// already and a rename marker is to come, so a caller that wrote the whole state would drop them.
export const recordOpened = (directory: string): Promise<void> => note("lastOpened", directory)

const note = async (field: "lastOpened" | "created", directory: string): Promise<void> => {
  const state = await readEditorState()
  await writeEditorState({ ...state, [field]: { ...state[field], [directory]: new Date().toISOString() } })
}

// The rename marker, on and off. Merged into whatever else the file holds, like every other write
// here: the two date maps are in there and a caller that wrote the whole state would drop them.
export const recordPendingRename = async (rename: PendingRename | null): Promise<void> => {
  const state = await readEditorState()
  await writeEditorState({ ...state, pendingRename: rename ?? undefined })
}

// What a project occupies, by walking it. The one call that descends into `assets/` - the picker
// deliberately does not, which is what keeps a recursive walk off the boot path - and it is here
// because a rename has to ask whether a second copy will fit.
export const projectSize = async (directory: string): Promise<number> => {
  const dir = await root()
  let total = 0
  for await (const file of walk(dir, `${PROJECTS}/${directory}`)) total += file.size
  return total
}

// Forget what this file knew about a project. Called when one is deleted, and **not merely
// tidiness**: an entry that outlives its directory is inherited by the next project to reuse that
// id, which would open on someone else's creation date and take their place in the list.
export const forgetProject = async (directory: string): Promise<void> => {
  const { lastOpened = {}, created = {} } = await readEditorState()
  delete lastOpened[directory]
  delete created[directory]
  await writeEditorState({ lastOpened, created })
}

export const writeEditorState = (state: EditorState): Promise<void> =>
  root().then((dir) => writeFile(dir, EDITOR_FILE, stringify(state)))
