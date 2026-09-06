import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from "@zip.js/zip.js/lib/zip-core-custom.js"
import { ErrorLevel, ParserError } from "../core/commands/Parser"
import { deleteSaveData } from "../core/save"
import { parseManifest } from "../yamlParser/parseManifest"
import { availableBytes, megabytes } from "./persistence"
import { takeProjectLock } from "./projectLock"
import {
  deleteProject,
  forgetExport,
  hasScript,
  isProject,
  openProjectFile,
  readManifest,
  recordCreated,
  recordExported,
  walkProject,
  writeManifest,
} from "./projectStore"

// The archive, both ways: a project in the library becomes a `<project-id>.webvn.zip` on the
// author's disk, and one on their disk becomes a project in the library. Tranche 3 of
// design-docs/PROJECT_STORAGE.md, specified in `.scratch/project-archive/`.
//
// **The invariant is the whole format: an archive always holds a project that parses and has a
// script.** Both directions enforce it - export refuses to build one from a project whose manifest
// does not parse, import refuses one that fails the same test - and neither degrades, warns and
// continues, or lands a partial project. That is
// docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md's line drawn at the format boundary
// rather than at the parser, and it inherits that ADR's asymmetry exactly: **the manifest gates the
// archive; the script never does.** A manifest declaring files nobody has drawn yet, a script with
// parse errors, and a script naming ids the manifest does not answer all travel freely in both
// directions, because each of those is an ordinary state of a project being written and the editor
// already reports every one of them on the line that caused it.
// docs/adr/0005-an-archive-holds-a-project-that-parses.md.
//
// **UI-free, and the only file in the repo that imports zip.js** - so "does the zip library reach
// the player bundle?" is answerable by reading one import list. It lives under `src/storage/`
// because it needs `projectStore`'s private knowledge of the `projects/<directory>/` layout, which a
// top-level `src/archive/` would have to re-spell. The picker and `AppShell` own the file input, the
// drop handler and the dialogs; everything a dialog decides arrives here as a callback.
//
// The library is pinned to `lib/zip-core-custom.js` rather than the package root: 30.6 KB gzipped
// against 65.0, no workers constructed at all (`workerURI: null`, so the webpack worker fragility
// `CLAUDE.md` warns about does not arise), deflate delegated to the platform's
// `CompressionStream`/`DecompressionStream` - and, decisively, the root entry bakes the *build
// machine's* absolute `file://` path into the bundle. `.scratch/project-archive/spec.md` has the
// measurement and both findings; `src/types/zipJs.d.ts` has why the deep specifier needs a
// declaration.

const MANIFEST_FILE = "manifest.yaml"
const SCRIPT_FILE = "script.yaml"

// The one place an archive is not exactly the project tree: generated on export at the archive root,
// and skipped on import **by exact path**, so a README.txt *inside* an author's project -
// `assets/README.txt` - still round-trips. One at the project root does not, in either direction:
// export writes the generated one in its place and import drops it again.
const README_FILE = "README.txt"

// Where an archive says to open it. **Hardcoded, not taken from `location`**: an archive travels -
// it gets emailed, backed up, found in Downloads two years later - and the one thing it must be able
// to tell a stranger is where the app lives, which `localhost:8080` cannot.
const APP_URL = "https://a544jh.github.io/webvn-demo/"
const SOURCE_URL = "https://github.com/a544jh/WebVn"

// Every import needs these from the first one: they cover content the author did not make, and they
// are awkward to retrofit. Both are checked against the sizes the **central directory** claims,
// before anything is inflated, which is what makes a zip bomb an arithmetic problem rather than a
// race with the quota draining.
//
// They live in the back half rather than at the file input, so the URL and folder producers tranche
// 4 adds are covered without retrofitting each.
export const MAX_ENTRIES = 5000
export const MAX_UNPACKED_BYTES = 2_000_000_000

// Media that is already compressed. Deflating it buys close to nothing while making import slower
// than a straight copy; the two YAML files do compress.
const PRECOMPRESSED = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".ogg", ".m4a", ".aac"]

// One file in an archive, as the back half sees it: where it sits, how big it says it is, and how to
// get its bytes out.
//
// **The size comes from the central directory rather than from the bytes**, so the caps are
// arithmetic over what the archive claims before anything is inflated. **The bytes go into a stream
// the caller opens** rather than coming back as a Blob, which is the property zip.js was chosen for
// over `unzipit` and is what `design-docs/PROJECT_STORAGE.md` writes out as
// `entry.getData(await handle.createWritable())`: an entry is inflated straight into OPFS and no
// decoded entry is ever materialized. And it is pulled per entry, only for the entries actually
// written, so a refused archive inflates nothing at all.
//
// Ticket 01 sketched this seam as an `AsyncIterable<ArchiveEntry>` carrying a `blob`. A one-pass
// iterable cannot answer the two questions the same ticket's ordering demands *before a byte is
// written* - what the whole archive sums to, and what its manifest says - without buffering the
// archive it was meant to avoid buffering.
export interface ArchiveEntry {
  readonly path: string
  readonly size: number
  readonly writeTo: (destination: WritableStream<Uint8Array>) => Promise<void>
}

// The one entry that has to be *read* rather than written: the manifest, whose text decides whether
// anything is written at all. `Response` is the platform's own stream-to-text, so an entry needs only
// the one way out of it - and a manifest is a few hundred bytes, which is why this is the exception
// rather than the shape.
//
// Both sides run at once on purpose: the reader drains what the writer puts in, and awaiting either
// alone would deadlock on a stream nobody is emptying.
const textOf = async (entry: ArchiveEntry): Promise<string> => {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const [text] = await Promise.all([new Response(readable).text(), entry.writeTo(writable)])
  return text
}

// Why an archive was refused, in the two parts the picker's banner is drawn in: the news, then what
// to do about it. `problem` is a clause rather than a sentence - the surface knows the filename and
// says "<name> was not imported: <problem>." - and the same shape carries an export's refusals,
// because they are the same invariant refusing in the other direction.
//
// **Import's refusals are not a fallback path.** Our own export cannot produce a bad archive, so
// every one of these is about a file that came from somewhere else - hand-edited, produced by
// another tool, or truncated in transit - and they are phrased for that reader.
export interface ArchiveRefusal {
  readonly kind: "refused"
  readonly problem: string
  readonly advice: string
}

const refuse = (problem: string, advice: string): ArchiveRefusal => ({ kind: "refused", problem, advice })

// Nothing happened, said once per direction. Every refusal below is raised before the first write or
// the first entry, and an author reading "was not imported" wants to know that in the same breath.
const NOTHING_WRITTEN = "Nothing was written."
const NOTHING_EXPORTED = "Nothing was exported."

// What an archive turned out to hold, once it is known to be importable: where it goes, what it is
// called, and the files to write. `files` is normalized - a wrapping directory stripped, the
// generated README dropped - and holds everything **except** the manifest, which is written last and
// on its own, because that single write is the commit point.
export interface ImportPlan {
  readonly kind: "plan"
  readonly id: string
  readonly title: string
  readonly manifestText: string
  readonly files: readonly ArchiveEntry[]
}

export interface ImportOptions {
  // Asked when the destination directory already holds a project. UI-free: the picker opens the
  // dialog and this only learns the answer.
  readonly confirmOverwrite: (plan: ImportPlan) => Promise<boolean>
}

export type ImportResult =
  // `overwrote` because the two outcomes look different to an author and read differently on the
  // status line: a fresh import adds a row they can see arrive, and an overwrite changes a row that
  // was already there - which is the one an author is most anxious about and the one with the least
  // to show for itself.
  | { readonly kind: "imported"; readonly directory: string; readonly title: string; readonly overwrote: boolean }
  // The author said no to the overwrite. Not a refusal: nothing went wrong, and there is nothing to
  // put on a banner.
  | { readonly kind: "cancelled" }
  | ArchiveRefusal

export type ExportResult =
  | { readonly kind: "exported"; readonly blob: Blob; readonly filename: string }
  | ArchiveRefusal

// A path inside a project, and nothing else. Any `..` segment, a leading `/`, a backslash, a drive
// letter or a control character is an entry that means to land somewhere other than where it says -
// and the whole archive is refused for it rather than the entry skipped, because a partial import is
// a failure rather than a project.
//
// **The drive letter is refused where a drive letter can be**, in the first segment, rather than by
// banning the colon outright. A colon is a legal character in a POSIX filename, so the blanket rule
// took down a whole archive over an asset called `scene: one.png` - which is a file an author can
// perfectly well have, and which means nothing about where the entry lands.
const isPlainRelativePath = (path: string): boolean => {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false
  if (/^[A-Za-z]:/.test(path)) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
}

// **`manifest.yaml` at the archive root, or in a single directory holding the whole archive.** The
// rule is unambiguous because a manifest at the root is mandatory, so the two layouts cannot be
// confused for one another.
//
// This matters more than the layout does: the natural way to re-zip an edited project - macOS
// right-click Compress, Windows "Send to compressed folder" - operates on the *folder* and produces
// a wrapped archive. A format meant to be opened by hand has to accept what a hand puts back.
const unwrapped = (entries: readonly ArchiveEntry[]): readonly ArchiveEntry[] => {
  if (entries.some((entry) => entry.path === MANIFEST_FILE)) return entries

  const prefix = entries[0]?.path.split("/")[0]
  if (prefix === undefined) return entries
  // Every entry, not merely most: a loose file beside the directory means there is no single wrapper
  // to strip, and stripping anyway would silently drop it.
  if (!entries.every((entry) => entry.path.startsWith(`${prefix}/`))) return entries

  return entries.map((entry) => ({ ...entry, path: entry.path.slice(prefix.length + 1) }))
}

const firstError = (errors: ParserError[]): ParserError | undefined =>
  errors.find((error) => error.level === ErrorLevel.ERROR) ?? errors[0]

// The parser's own words, which is what an author needs when the archive came from somewhere else -
// above all for a manifest from a later format, which `parseManifest` reports first and alone by
// design, so that one message explains itself.
//
// **The clause only**, with the caller supplying the sentence in front of it: import says nothing was
// written and export says nothing was exported, and a helper that supplied one of them made the other
// read "Nothing was exported. Nothing was written."
const parserClause = (errors: ParserError[]): string => {
  const error = firstError(errors)
  return error === undefined ? "" : ` Line ${error.location.startLine}: ${error.message}`
}

// Everything an import decides before it is allowed to write anything, over a listing rather than
// over a stream: normalization, every refusal, and the caps. Pure but for pulling the manifest's own
// bytes, which is what makes the whole back half reachable from `test/unit/` with no zip library and
// no OPFS in the way.
//
// `available` is what the browser says is free, or null when it will not say - **an unknown budget
// is not a small one**, so it does not refuse. It is a parameter rather than a call so that this
// stays testable, and so that the estimate is read once per import rather than once per check.
export const planImport = async (
  entries: readonly ArchiveEntry[],
  available: number | null
): Promise<ImportPlan | ArchiveRefusal> => {
  const escaping = entries.find((entry) => !isPlainRelativePath(entry.path))
  if (escaping !== undefined) {
    return refuse(
      `it holds a file outside the project: "${escaping.path}"`,
      `${NOTHING_WRITTEN} Every file in an archive has to sit inside it.`
    )
  }

  const files = unwrapped(entries)

  if (files.length > MAX_ENTRIES) {
    return refuse(
      `it holds ${files.length} files, and the limit is ${MAX_ENTRIES}`,
      `${NOTHING_WRITTEN} A project archive holds a manifest, a script and the assets they name.`
    )
  }
  const unpacked = files.reduce((total, file) => total + file.size, 0)
  if (unpacked > MAX_UNPACKED_BYTES) {
    return refuse(
      `it unpacks to ${megabytes(unpacked)}, and the limit is ${megabytes(MAX_UNPACKED_BYTES)}`,
      `${NOTHING_WRITTEN} A project archive holds a manifest, a script and the assets they name.`
    )
  }
  if (available !== null && unpacked > available) {
    return refuse(
      `it unpacks to ${megabytes(unpacked)}, and there is ${megabytes(available)} of room`,
      `${NOTHING_WRITTEN} Free some space, or delete a project you have finished with, and try again.`
    )
  }

  const manifest = files.find((file) => file.path === MANIFEST_FILE)
  if (manifest === undefined) {
    return refuse(
      "it has no manifest.yaml",
      `${NOTHING_WRITTEN} An archive holds a project's manifest.yaml at its root, or in one folder inside it.`
    )
  }
  const manifestText = await textOf(manifest)
  // The id is gated here too, and by the same schema: `parseManifest` validates it with the rule
  // `validateProjectId` states, because that one rule has to hold for the OPFS directory, the export
  // filename and the save key at once. A manifest that parses therefore always names a directory
  // this can create, and there is no second copy of a filesystem-safety rule to drift.
  const [parsed, errors] = parseManifest(manifestText)
  if (parsed === null) return refuse("its manifest.yaml does not parse", NOTHING_WRITTEN + parserClause(errors))

  // **Refused because nothing else would catch it.** `recoverProjects` deliberately does not sweep a
  // manifest with no script - that is the state `createProject` passes through between its two
  // writes - so a script-less archive would land, appear in the picker with its title, and then throw
  // out of `readProject` when the author clicked it: a dead row, in the surface whose entire purpose
  // is opening things. Supplying an empty script instead turns "this archive is broken" into "this
  // project mysteriously lost its story", which the author cannot tell apart.
  if (!files.some((file) => file.path === SCRIPT_FILE)) {
    return refuse(
      "it has no script.yaml",
      `${NOTHING_WRITTEN} An archive holds a project's script beside its manifest.`
    )
  }

  return {
    kind: "plan",
    id: parsed.id,
    title: parsed.title,
    manifestText,
    files: files.filter((file) => file.path !== MANIFEST_FILE && file.path !== README_FILE),
  }
}

// The write, and its ordering is the rest of the import:
//
// 0. Plan, which settles every refusal - **before a byte is written**.
// 1. Take the destination's project lock.
// 2. Clear the destination, and forget what the store knew about whatever was there.
// 3. Write every entry but the manifest.
// 4. **Write the manifest. That single atomic write is the commit point.**
// 5. Record `created`, but only if the directory is new. Release the lock.
//
// **Step 4 is the opposite of `createProject`'s ordering, and that is deliberate.** `createProject`
// writes the manifest first so that a project being minted never presents as the residue a crashed
// rename leaves; an import is a copy rather than a mint, and a manifest written first would mean a
// crash mid-import leaves a directory that *looks* like a valid project with files silently missing -
// the "project with silent holes in it" the rename recovery exists to prevent. `renameProject` already
// commits this way. Before step 4 the destination has no manifest and is therefore garbage; after it,
// it is a valid project; there is no third state.
//
// **The crash recovery is free, and the lock is what makes it safe.** `recoverProjects` already
// sweeps manifest-less directories on every picker render, so a crashed import needs no marker and no
// new recovery code - but a *live* import is in exactly that state, so the sweep must be unable to
// reach it. It takes the lock on what it deletes, which is why step 1 is not optional.
//
// **A failed import loses nothing**, which is what makes this ordering enough. Unlike a rename, whose
// source is destroyed as part of the operation, the archive is still on disk: re-running the import
// is the recovery, and the author already accepted the destruction in the overwrite dialog.
export const importProject = async (
  entries: readonly ArchiveEntry[],
  options: ImportOptions
): Promise<ImportResult> => {
  const plan = await planImport(entries, await availableBytes())
  if (plan.kind === "refused") return plan

  // The manifest's id is the destination, always: not the archive's filename, and not the wrapping
  // directory just stripped. Those are labels derived from the id and are allowed to be stale.
  const directory = plan.id

  // **The lock first, and only then the question.** Asking the other way round means an author can
  // agree to destroy a project and then be told the import could not happen anyway - a confirmation
  // collected for nothing, about the most alarming thing this app does. It also makes the answer to
  // "is something already filed here" stay true long enough to act on, which is what `bootEditor`
  // takes its lock before asking for.
  const lock = await takeProjectLock(directory)
  if (lock === null) {
    return refuse(`"${directory}" is open in another tab`, "Nothing was imported. Close it there and try again.")
  }

  const taken = await isProject(directory)
  if (taken && !(await options.confirmOverwrite(plan))) {
    await lock.release()
    return { kind: "cancelled" }
  }

  try {
    // Whatever was here is not what is arriving, so it goes whole rather than being written over
    // file by file - which would leave the previous project's assets mixed into this one. Residue
    // from a crashed import or rename goes the same way, and removing a path that is not there is
    // not an error.
    await deleteProject(directory)
    // **An id is reusable, so anything that claims one has to drop its saves.** A save left under it
    // describes a story this project does not have, replay throws, and `SaveLoadMenu` has no
    // try/catch - so Load becomes a dead button. Ticket 01 puts this under the overwrite; it is one
    // line broader here, because a *fresh* directory can still collide with saves written by a
    // published build of the same id played in this browser, which is the identical failure. In the
    // "importing my own backup" case those saves would still have been valid, but that case is
    // indistinguishable at import time from "someone sent me a project that happens to share an id",
    // and guessing wrong produces the dead button.
    deleteSaveData(plan.id)
    await forgetExport(directory)

    // Each entry inflated straight into the file it lands in, one at a time - see `ArchiveEntry`, and
    // `openWritable` in opfs.ts for why this is the one write that does not go through `writeFile`.
    for (const file of plan.files) {
      const destination = await openProjectFile(directory, file.path)
      try {
        await file.writeTo(destination)
      } catch (e) {
        // **An open stream holds a lock on the file it is writing**, and while it is held *nothing*
        // can remove the directory around it: `removeEntry` is refused with
        // `NoModificationAllowedError`, which is the failure `recoverProjects` already has a comment
        // about. So a truncated archive would otherwise leave residue that the sweep which exists to
        // remove it can never remove - for the life of the page. Aborting is what gives the lock back.
        await destination.abort().catch(() => undefined)
        throw e
      }
    }

    await writeManifest(directory, plan.manifestText)

    if (!taken) await recordCreated(directory)
  } finally {
    // Even when a write threw: the destination is manifest-less garbage at that point, and the sweep
    // that removes it takes this same lock. A held lock would leave it standing for the life of the
    // page and the author's own directory refusing them.
    await lock.release()
  }

  return { kind: "imported", directory, title: plan.title, overwrote: taken }
}

// `PK\x03\x04`, **never the extension**: renaming a project file must not make it unopenable, and a
// drop carries no reliable extension anyway. It is also what makes the `.webvn.zip` naming reversible
// - that decision only picks the filename export suggests.
const isZip = async (file: Blob): Promise<boolean> => {
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  return magic.length === 4 && magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04
}

const NOT_AN_ARCHIVE = "A project archive is the .webvn.zip that Export ZIP writes."

// A file from the picker's input or from a drop, read into the library. The zip half, and the only
// caller of the back half above that a surface has any business with.
//
// `BlobReader` slices, so a disk-backed `File` is never held whole, and the central directory carries
// a size per entry, so the caps are arithmetic rather than a watch on the quota draining.
export const importArchive = async (file: Blob, options: ImportOptions): Promise<ImportResult> => {
  if (!(await isZip(file))) return refuse("it is not a zip file", `${NOTHING_WRITTEN} ${NOT_AN_ARCHIVE}`)

  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries().catch(() => null)
    if (entries === null) return refuse("it is a zip file this could not read", `${NOTHING_WRITTEN} ${NOT_AN_ARCHIVE}`)
    return await importProject(
      entries
        .filter((entry) => !entry.directory)
        .map((entry) => ({
          path: entry.filename,
          size: entry.uncompressedSize,
          // zip.js takes the destination stream and closes it itself, which is the commit - so there
          // is no `close()` after, exactly as `writeFile`'s Blob path has none after its `pipeTo`.
          writeTo: async (destination: WritableStream<Uint8Array>) => {
            await entry.getData(destination)
          },
        })),
      options
    )
  } finally {
    // After the writes, because the entries above are read out of this reader as they are written.
    await reader.close().catch(() => undefined)
  }
}

// `<project-id>.webvn.zip`, from the manifest's id - which always exists, because export is gated on
// a manifest that parses.
//
// **The extension really is `.zip`.** Every precedent (`.sb3`, `.love`, `.epub`, `.docx`, `.kra`)
// belongs to an application that installs and registers a file-type handler, which this project has
// ruled out - so nothing on the author's machine would ever claim `.webvnproj`, and its only
// achievement would be a double-click that says "no app associated with this file". A pleasant
// accident: Windows hides known extensions by default, so the file *displays* as `my-story.webvn`.
export const archiveFilename = (id: string): string => `${id}.webvn.zip`

// Whether a file goes into the archive as it stands rather than being deflated.
export const storesWhole = (path: string): boolean =>
  PRECOMPRESSED.some((extension) => path.toLowerCase().endsWith(extension))

// **This text ships inside every archive already exported, so unlike a design doc it cannot be
// corrected later.** That rules out describing architecture in it, and it is why it is written as an
// instruction rather than a prohibition: "to work on this, open X and import this file" stays true if
// the linked-folder layer ever lands, where "editing these files does nothing" would not.
export const readmeText = (id: string, title: string, at: Date): string =>
  [
    `This is a WebVn project: "${title}" (${id}).`,
    "",
    `To work on it, open ${APP_URL} and import`,
    "this zip file.",
    "",
    `WebVn is free and open source: ${SOURCE_URL}`,
    "",
    `Exported ${at.toISOString().slice(0, 10)} by WebVn.`,
    "",
  ].join("\n")

// A project in the library, written out as one file.
//
// **A tree copy**: everything under `projects/<directory>/`, unwrapped at the archive root, including
// files the manifest does not declare - which is also what keeps this correct when
// design-docs/SCRIPT_INCLUDES.md puts N script files into a project that no manifest mentions. The
// manifest is read for the **filename and the gate** only. `editor.yaml` is not in it: it sits beside
// `projects/`, not inside a project, and is the editor's bookkeeping rather than project data.
//
// **An archive carries no saves.** They live in localStorage under `vn-save-<id>`, not under
// `projects/`, and a round trip therefore restores the project and not the playthrough. Stated
// because the next reader will otherwise wonder whether it was an oversight.
//
// The caller owns what this cannot know: that the tree is not being written into. For the **open**
// project that means flushing the storer first - the debounce is 2000ms, so an export taken straight
// after typing would otherwise ship an archive missing the author's last sentence, and a walk has to
// run over a tree nothing is writing into (`walkFrom` in opfs.ts has the measurement). For **another**
// project it means holding its lock. Note the asymmetry is forced: `takeProjectLock` uses
// `ifAvailable`, so a session trying to take the lock it already holds would refuse itself.
export const exportProject = async (directory: string): Promise<ExportResult> => {
  const manifestText = await readManifest(directory).catch(() => null)
  if (manifestText === null) {
    return refuse("it has no manifest.yaml", `${NOTHING_EXPORTED} There is no project in that folder.`)
  }
  const [manifest, errors] = parseManifest(manifestText)
  if (manifest === null) {
    // The gate that ADR 0005 is about, and the one that costs an explanation: the store deliberately
    // keeps an unparseable project listed, openable and renameable, because it is an author's project
    // with a typo in it. What it cannot do is leave the browser - an archive is named after an id and
    // imports into a directory named after one, and a manifest that does not parse has declared no
    // id. The hatch that looks closed is not: fix the typo in the editor, then export.
    return refuse("its manifest.yaml does not parse", NOTHING_EXPORTED + parserClause(errors))
  }
  // Unreachable from anything the app can currently produce, and kept anyway: it costs one `exists`,
  // and it is the half that stops a bad archive existing rather than the half that catches one
  // afterwards.
  if (!(await hasScript(directory))) {
    return refuse("it has no script.yaml", `${NOTHING_EXPORTED} An archive always holds a script.`)
  }

  const writer = new ZipWriter<Blob>(new BlobWriter("application/zip"))
  // First, so it is the first thing visible when the zip is opened in an OS viewer.
  await writer.add(README_FILE, new TextReader(readmeText(manifest.id, manifest.title, new Date())))
  for await (const file of walkProject(directory)) {
    // **A project holding its own `README.txt` at the root gives way to the generated one**, and this
    // is not a preference: `ZipWriter.add` throws "File already exists" on a duplicate name, so
    // without this an author who put a readme beside their manifest could not export at all. Nothing
    // is lost that would have survived anyway - import skips that exact path on the way back in, so a
    // root README never round-trips whichever of the two is in the archive. One inside the project,
    // `assets/README.txt`, is untouched and does round-trip.
    if (file.path === README_FILE) continue
    const options = storesWhole(file.path) ? { level: 0 } : undefined
    await writer.add(file.path, new BlobReader(await file.handle.getFile()), options)
  }
  const blob = await writer.close()

  // Here rather than in either caller, because both surfaces export and an author who exports from
  // inside the editor must find the library's row already saying so. It records the attempt rather
  // than the save - a download can be cancelled and there is no event that says so - which is the
  // honest approximation and errs in the milder direction.
  await recordExported(directory)

  return { kind: "exported", blob, filename: archiveFilename(manifest.id) }
}
