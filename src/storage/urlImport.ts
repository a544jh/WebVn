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
  refuse,
} from "./archive"
import { availableBytes, sizeLabel } from "./persistence"

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

// Refusals are the archive's shape, `refuse(problem, advice)`, and the picker draws them the same way:
// "<host> was not imported: <problem>." and then the advice.
const WHAT_IT_HOLDS = "A published story holds a manifest, a script and the assets they name."

// **A host that sends no CORS headers and a host that is not there fail the same way** - the same
// `TypeError`, by design, so that a page cannot probe what another origin would have said - and are
// told apart afterwards by `answers`. A redirect without the header - GitHub Pages' own `/name` to
// `/name/` - fails the same way, which is why `publishedFolderAt` never requests that address.
const UNREACHABLE = refuse("it could not be reached", "Check the address, and that the site is up.")

// **The lead is the part that is certain**: a host that answers without CORS headers refuses other sites
// every file it has, the manifest or no manifest. What is not certain goes in the advice. A response
// without the headers is opaque to this page - no status, no body - so a folder with a manifest in it
// and an address with nothing at it look exactly the same from here, and the advice says the address
// may be wrong as well as naming the header the site would have to send.
const WITHOUT_CORS = refuse(
  "it does not allow its files to be used by other sites",
  "It answered without CORS headers, so there is no telling whether a manifest.yaml is at that address either - check it. If it is right, the site has to send an Access-Control-Allow-Origin header before a story on it can be imported."
)

const NO_MANIFEST = refuse(
  "there is no manifest.yaml at that address",
  "Import from URL takes the address of a published WebVn story - the page that plays it."
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
      ? "The site answered with a web page instead of that file."
      : "The story declares that file, but the site does not have it."
  )

const stalled = (path: string): ArchiveRefusal =>
  refuse(`${path} stopped arriving`, "The site may be busy - try again later.")

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
  | { readonly kind: "over" }

// One of the two YAML files, read as text because everything after depends on what they say - and
// they are the two refusals that say the most, which is why both come before anything else is
// fetched. Through the same meter and the same stall timer as every other file, so a manifest that
// never finishes arriving is abandoned rather than holding the picker, and a huge one counts.
const fetchText = async (address: string, allowance: Allowance): Promise<Fetched> => {
  const watchdog = new Watchdog(STALL_MS)
  try {
    const response = await fetch(address, { signal: watchdog.signal }).catch(() => null)
    if (response === null) return { kind: watchdog.stalled ? "stalled" : "unreachable" }
    if (!isServedFile(response)) return { kind: "missing" }
    watchdog.fed()
    const body = response.body ?? new Blob([]).stream()
    const text = await new Response(body.pipeThrough(metered(allowance, () => watchdog.fed()))).text().catch(() => null)
    if (text === null) return { kind: allowance.used > allowance.limit ? "over" : "stalled" }
    // The address the file was **finally** served from, after any redirect the browser could follow.
    // Everything else is fetched against it rather than against what was typed.
    return { kind: "text", text, url: response.url === "" ? address : response.url }
  } finally {
    watchdog.stop()
  }
}

// Whether anything answered at an address, asked again once a request to it has failed.
//
// **`no-cors` is what makes the difference visible.** In that mode a request resolves with an opaque
// response - no status, no headers, no body - whenever the host answered at all, CORS headers or none,
// and rejects only when nothing could be reached. Measured 2026-09-28 in Chromium: a server with no
// CORS headers rejects a normal request with `TypeError: Failed to fetch` and resolves this one as
// `opaque` with status 0, for a file that is there and for one that is not alike, while an address
// nothing listens on rejects both. So it learns nothing a page is not allowed to know - not even
// whether the file exists - which is why `WITHOUT_CORS` cannot say either.
//
// One more request, and only on the way to a refusal. Under the same stall timer as every other, so a
// host that takes the connection and then says nothing cannot hold the picker either.
const answers = async (address: string): Promise<boolean> => {
  const watchdog = new Watchdog(STALL_MS)
  try {
    return await fetch(address, { mode: "no-cors", signal: watchdog.signal }).then(
      () => true,
      () => false
    )
  } finally {
    watchdog.stop()
  }
}

// A file already in hand, written into the stream the back half opened. The manifest and the script:
// they had to be read to decide anything at all, so they are not fetched a second time.
// Their bytes were counted as they arrived, so they carry no size for the back half to count again.
const textEntry = (path: string, text: string): ArchiveEntry => {
  const blob = new Blob([text])
  return { path, size: 0, writeTo: (destination) => blob.stream().pipeTo(destination) }
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
      if (e instanceof PassedAllowance) throw new Refused(over())
      // A request that failed or was abandoned is the site's doing. **Anything else is this
      // browser's** - OPFS refusing a write, the quota running out under it - and is not the site's
      // to be blamed for, so it goes on to the picker as a failure rather than as "stopped arriving".
      if (watchdog.stalled || e instanceof TypeError) throw new Refused(stalled(path))
      throw e
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
    return refuse("that is not the address of a published folder", address.problem)
  }

  // The lower of the byte cap and the free space, measured once, at the start - the same pair the back
  // half checks an archive against, enforced here as the bytes arrive rather than as arithmetic.
  const available = await availableBytes()
  const byRoom = available !== null && available < MAX_UNPACKED_BYTES
  const allowance: Allowance = { used: 0, limit: byRoom ? (available as number) : MAX_UNPACKED_BYTES }
  const over = (): ArchiveRefusal =>
    byRoom
      ? refuse(
          `it passed ${sizeLabel(allowance.limit)}, which is all the room there is`,
          "Free some space, or delete a project you have finished with, and try again."
        )
      : refuse(`it passed ${sizeLabel(allowance.limit)}, which is the limit`, WHAT_IT_HOLDS)

  const manifestAddress = new URL(MANIFEST_FILE, address.url).href
  const manifestFile = await fetchText(manifestAddress, allowance)
  // Only here, on the first request: past the manifest the site has already been read from, so a
  // request that fails later is a file that stopped arriving rather than a question about the site.
  if (manifestFile.kind === "unreachable") return (await answers(manifestAddress)) ? WITHOUT_CORS : UNREACHABLE
  if (manifestFile.kind === "stalled") return stalled(MANIFEST_FILE)
  if (manifestFile.kind === "over") return over()
  if (manifestFile.kind === "missing") return NO_MANIFEST
  const folder = manifestFile.url

  const [manifest, errors] = parseManifest(manifestFile.text)
  if (manifest === null) return refuse("its manifest.yaml does not parse", parserClause(errors))

  const scriptFile = await fetchText(addressOf(SCRIPT_FILE, folder), allowance)
  if (scriptFile.kind === "missing") {
    return refuse("it has no script.yaml", "A published story holds its script beside its manifest.")
  }
  if (scriptFile.kind === "over") return over()
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
      "Every file a published story declares has to sit inside its folder."
    )
  }

  const entries = files.map((path) =>
    path === MANIFEST_FILE
      ? textEntry(path, manifestFile.text)
      : path === SCRIPT_FILE
      ? textEntry(path, scriptFile.text)
      : fileEntry(path, folder, allowance, over)
  )

  try {
    return await importProject(entries, { refuseTaken: true })
  } catch (e) {
    if (e instanceof Refused) return e.refusal
    throw e
  }
}
