import { isServedFile, MANIFEST_FILE, publishedFiles, publishedFolderAt, SCRIPT_FILE } from "../publishedFolder"
import { parseManifest } from "../yamlParser/parseManifest"
import {
  ArchiveEntry,
  ArchiveRefusal,
  importProject,
  ImportResult,
  isPlainRelativePath,
  MAX_ENTRIES,
  MAX_UNPACKED_BYTES,
  parserClause,
} from "./archive"
import { availableBytes, megabytes } from "./persistence"

// Import from URL: a published folder, read from its address into the library as a new project. The
// publish format read backwards - `.scratch/published-folder/spec.md`, "Importing from a URL" - and
// docs/adr/0007-a-published-folder-is-complete.md is the rule it enforces on the way in: a folder
// missing any declared file is refused, never landed with a hole in it.
//
// **A producer, not a second import.** It turns an address into the `ArchiveEntry` listing the zip
// reader produces from a file, and hands that to `importProject` - so the lock, dropping the saves,
// writing the manifest last, recording `created` and the crash sweep that takes away a manifest-less
// directory are all written once, in `archive.ts`. It asks for the one option that back half has:
// **a taken id is refused rather than overwritten**, which is what makes it safe to stream straight
// from the network into the destination. Nothing here imports zip.js; that stays one file's business.
//
// **It refuses in its own words**, never as the generic failure the picker shows for an archive that
// threw. Reachability, the manifest, its parse and the script are settled before the back half is
// called; a file that fails, the byte limit and a stall are raised from inside each entry's `writeTo`,
// as a `Refused`, and turned back into their refusal here. The back half's own two - the taken id and
// the lock - read correctly for either source.

// How long a file may deliver nothing before it is abandoned. A host that stops sending mid-file would
// otherwise hold the picker busy forever, and there is no progress bar or Cancel to reach for. Checked
// by hand, since a static test server never stalls.
const STALL_MS = 30_000

// Why a published folder was not imported, in the two parts the picker's banner is drawn in. The
// picker says "<host> was not imported: <problem>." and then the advice.
const refuse = (problem: string, advice: string): ArchiveRefusal => ({ kind: "refused", problem, advice })

const NOTHING_WRITTEN = "Nothing was written."
const WHAT_IT_HOLDS = `${NOTHING_WRITTEN} A published story holds a manifest, a script and the assets they name.`

// **Unreachable and a host that does not send CORS headers are one message**, because a page cannot
// tell them apart: both reject as the same `TypeError`, by design, so that a page cannot probe what
// another origin would have said. A redirect without the header - GitHub Pages' own `/name` to
// `/name/` - fails the same way, which is why `publishedFolderAt` never requests that address.
const UNREACHABLE = refuse(
  "it could not be reached, or it does not let other sites read its files",
  `${NOTHING_WRITTEN} Check the address. If it is right, that site does not allow importing.`
)

const NO_MANIFEST = refuse(
  "there is no manifest.yaml at that address",
  `${NOTHING_WRITTEN} Import from URL takes the address of a published WebVn story - the page that plays it.`
)

// **The first file that fails ends the import, and only it is named.** Naming every missing file would
// mean fetching the rest just to count them, and the person importing is usually not the author and
// cannot fix the host - one name is enough to see what went wrong. Publish, which checks a local
// store, names every one.
//
// Two ways for a file to be missing, said differently because they mean different things: a real 404
// is the site not having it, and a web page is a site set up to answer every address with its front
// page, which is what a single-page-app host does.
const missing = (path: string, answeredWithPage: boolean): ArchiveRefusal =>
  refuse(
    `${path} is missing there`,
    answeredWithPage
      ? `${NOTHING_WRITTEN} The site answered with a web page instead of that file.`
      : `${NOTHING_WRITTEN} The story declares that file, but the site does not have it.`
  )

const stalled = (path: string): ArchiveRefusal =>
  refuse(`${path} stopped arriving`, `${NOTHING_WRITTEN} The site may be busy - try again later.`)

// A refusal raised from inside a file's `writeTo`, where the only way out is to throw - so the
// back half aborts the stream it opened and releases the lock on the way past, as it already does for
// a truncated archive. Caught again in `importFromUrl`.
class Refused extends Error {
  constructor(readonly refusal: ArchiveRefusal) {
    super(refusal.problem)
  }
}

// The most one import may write, and how much it has so far. **A running total across every file**,
// because a host does not reliably say how big its files are before sending them: the entries carry
// no size for the back half's arithmetic check, so this enforces the same caps as the bytes pass.
export interface Allowance {
  used: number
  readonly limit: number
}

export class PassedAllowance extends Error {}

// Every byte of a file on its way into the store: counted into the import's allowance, and **stopped
// the moment the total passes it**, partway through a file if that is where it happens. Also says each
// chunk arrived, which is what keeps the stall timeout from firing on a file that is merely slow.
export const metered = (allowance: Allowance, arrived: () => void): TransformStream<Uint8Array, Uint8Array> =>
  new TransformStream({
    transform(chunk, controller) {
      arrived()
      allowance.used += chunk.byteLength
      if (allowance.used > allowance.limit) throw new PassedAllowance()
      controller.enqueue(chunk)
    },
  })

// Abandons a request that has delivered nothing for a whole interval, by aborting the signal it was
// made with - which rejects the fetch, or errors a body mid-read. **Fed, not a deadline**:
// `AbortSignal.timeout` would kill a large file that is arriving perfectly well, just slowly.
export class Watchdog {
  private readonly controller = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  public stalled = false

  constructor(private readonly ms: number) {
    this.fed()
  }

  public get signal(): AbortSignal {
    return this.controller.signal
  }

  public fed(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.stalled = true
      this.controller.abort()
    }, this.ms)
  }

  public stop(): void {
    clearTimeout(this.timer)
  }
}

// A path inside the folder as a URL, **one segment at a time**: a filename is free text in a
// manifest, and a `#` or a `?` in one would otherwise be read as the start of a fragment or a query.
const addressOf = (path: string, folder: string): string =>
  new URL(path.split("/").map(encodeURIComponent).join("/"), folder).href

type Fetched =
  | { readonly kind: "text"; readonly text: string; readonly url: string }
  | { readonly kind: "unreachable" }
  | { readonly kind: "missing" }
  | { readonly kind: "stalled" }

// One of the two YAML files. They are small, so they are read whole rather than streamed - and they
// are the two refusals that say the most, which is why both come before anything else is fetched.
const fetchText = async (address: string): Promise<Fetched> => {
  const watchdog = new Watchdog(STALL_MS)
  try {
    const response = await fetch(address, { signal: watchdog.signal }).catch(() => null)
    if (response === null) return { kind: watchdog.stalled ? "stalled" : "unreachable" }
    if (!isServedFile(response)) return { kind: "missing" }
    const text = await response.text().catch(() => null)
    if (text === null) return { kind: "stalled" }
    // The address the file was **finally** served from, after any redirect the browser could follow.
    // Everything else is fetched against it rather than against what was typed.
    return { kind: "text", text, url: response.url === "" ? address : response.url }
  } finally {
    watchdog.stop()
  }
}

// A file already in hand, written into the stream the back half opened. The manifest and the script:
// they had to be read to decide anything at all, so they are not fetched a second time.
const textEntry = (path: string, text: string): ArchiveEntry => {
  const blob = new Blob([text])
  return { path, size: blob.size, writeTo: (destination) => blob.stream().pipeTo(destination) }
}

// A declared file, fetched only when the back half asks for it - which is after the lock and the
// taken-id check, so **a refused id has fetched nothing the folder declares**. The body is piped
// straight into the file it lands in, counted as it passes; no file is ever held whole.
const fileEntry = (path: string, folder: string, allowance: Allowance, over: () => ArchiveRefusal): ArchiveEntry => ({
  path,
  size: 0,
  writeTo: async (destination) => {
    const watchdog = new Watchdog(STALL_MS)
    try {
      const response = await fetch(addressOf(path, folder), { signal: watchdog.signal }).catch(() => null)
      // Past the manifest, a request that fails is a file that did not arrive, whether the host went
      // down or stopped answering: the folder was reachable a moment ago.
      if (response === null) throw new Refused(stalled(path))
      if (!isServedFile(response)) throw new Refused(missing(path, response.ok))
      watchdog.fed()
      const body = response.body ?? new Blob([]).stream()
      await body.pipeThrough(metered(allowance, () => watchdog.fed())).pipeTo(destination)
    } catch (e) {
      if (e instanceof Refused) throw e
      throw new Refused(e instanceof PassedAllowance ? over() : stalled(path))
    } finally {
      watchdog.stop()
    }
  },
})

// The published folder at an address, read into the library. The address is whatever the author
// typed; `publishedFolderAt` says what they meant, and the dialog has already refused anything it
// refuses, beside the field - so a refusal of it here is for a caller that skipped the dialog.
//
// The order is the spec's, and each step is what makes the next one safe:
// 1. `manifest.yaml`, which says whether anything is there at all;
// 2. its parse, which is the project's identity and its file list;
// 3. `script.yaml`, fetched up front with the manifest;
// 4. the file list, and the entry cap, before any further fetch;
// 5. the back half: lock, taken id, and then each declared file, fetched as it is written.
export const importFromUrl = async (typed: string): Promise<ImportResult> => {
  const address = publishedFolderAt(typed)
  if (address.kind === "refused") {
    return refuse("that is not the address of a published folder", `${NOTHING_WRITTEN} ${address.problem}`)
  }

  const manifestFile = await fetchText(new URL(MANIFEST_FILE, address.url).href)
  if (manifestFile.kind === "unreachable") return UNREACHABLE
  if (manifestFile.kind === "stalled") return stalled(MANIFEST_FILE)
  if (manifestFile.kind === "missing") return NO_MANIFEST
  const folder = manifestFile.url

  const [manifest, errors] = parseManifest(manifestFile.text)
  if (manifest === null) return refuse("its manifest.yaml does not parse", NOTHING_WRITTEN + parserClause(errors))

  const scriptFile = await fetchText(addressOf(SCRIPT_FILE, folder))
  if (scriptFile.kind === "missing") {
    return refuse("it has no script.yaml", `${NOTHING_WRITTEN} A published story holds its script beside its manifest.`)
  }
  if (scriptFile.kind !== "text") return stalled(SCRIPT_FILE)

  const files = publishedFiles(manifest)
  // Known the moment the manifest parses, so checked before anything it declares is fetched.
  if (files.length > MAX_ENTRIES) {
    return refuse(
      `it declares ${files.length.toLocaleString("en")} files, and the limit is ${MAX_ENTRIES.toLocaleString("en")}`,
      WHAT_IT_HOLDS
    )
  }
  // A filename is free text in a manifest, so one can climb out of the folder. The back half would
  // refuse it too, but in an archive's words; this is the same rule said about a published story.
  const escaping = files.find((path) => !isPlainRelativePath(path))
  if (escaping !== undefined) {
    return refuse(
      `it declares a file outside its folder: "${escaping}"`,
      `${NOTHING_WRITTEN} Every file a published story declares has to sit inside its folder.`
    )
  }

  // The lower of the byte cap and the free space, measured once, at the start - the same pair the back
  // half checks an archive against, enforced here as the bytes arrive rather than as arithmetic.
  const available = await availableBytes()
  const byRoom = available !== null && available < MAX_UNPACKED_BYTES
  const allowance: Allowance = { used: 0, limit: byRoom ? (available as number) : MAX_UNPACKED_BYTES }
  const over = (): ArchiveRefusal =>
    byRoom
      ? refuse(
          `it passed ${megabytes(allowance.limit)}, which is all the room there is`,
          `${NOTHING_WRITTEN} Free some space, or delete a project you have finished with, and try again.`
        )
      : refuse(`it passed ${megabytes(allowance.limit)}, which is the limit`, WHAT_IT_HOLDS)

  const entries = files.map((path) =>
    path === MANIFEST_FILE
      ? textEntry(path, manifestFile.text)
      : path === SCRIPT_FILE
      ? textEntry(path, scriptFile.text)
      : fileEntry(path, folder, allowance, over)
  )
  allowance.used = entries.reduce((total, entry) => total + entry.size, 0)

  try {
    return await importProject(entries, { refuseTaken: true })
  } catch (e) {
    if (e instanceof Refused) return e.refusal
    throw e
  }
}
