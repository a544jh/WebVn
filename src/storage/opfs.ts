// The filesystem layer under the project store, knowing nothing about manifests, projects or ids.
// design-docs/PROJECT_STORAGE.md, "Storage: OPFS" and "Load-bearing details". A module of functions
// rather than a class, and every one of them takes the directory handle it works under, so nothing
// here holds global state and a test can point it at a scratch directory.
//
// `path` is always slash-separated and relative to `dir`. Splitting it and walking the segments
// happens in the two helpers at the top and at no call site.

export interface WalkedFile {
  readonly path: string
  readonly handle: FileSystemFileHandle
  // Carried because `getFile()` is already in hand here and the library UI's per-project figure has
  // nowhere else to come from: `navigator.storage.estimate()` is origin-wide. Cheaper to yield now
  // than to add a second walk later.
  readonly size: number
}

export const opfsRoot = (): Promise<FileSystemDirectoryHandle> => navigator.storage.getDirectory()

// Whether this browser can hold a project at all. A browser that fails this gets no editor - see
// src/index.ts. There is deliberately no memory-only fallback: a second boot path that behaves
// differently and is exercised by nobody is a maintenance cost with no owner, and an editor that
// silently cannot store is worse than one that says so. The *player* never touches OPFS, so it
// works in any browser either way.
//
// `createWritable` is checked on the prototype rather than on a handle because this is synchronous
// and getting a handle is not; it is the half of OPFS whose support has been uneven (Safari), and
// the alternative to it is a dedicated worker plus `createSyncAccessHandle()`. That worker path is
// deliberately not built: it is a whole second implementation of the write half, justified by
// reports rather than a measurement, and it would land untested against the browser it exists for.
// It cannot even be feature-detected from here - `createSyncAccessHandle` is worker-only by design
// and is `undefined` on the main thread - so detecting whether it is needed would itself cost a
// worker. If a real browser turns out to require it, that is a ticket with a reproduction attached.
export const isSupported = (): boolean =>
  typeof navigator !== "undefined" &&
  typeof navigator.storage?.getDirectory === "function" &&
  typeof FileSystemFileHandle !== "undefined" &&
  typeof FileSystemFileHandle.prototype.createWritable === "function"

const segments = (path: string): string[] => path.split("/").filter((segment) => segment !== "")

// The directory a path names, walking (and optionally creating) every segment on the way.
const directoryAt = async (
  dir: FileSystemDirectoryHandle,
  path: string,
  create: boolean
): Promise<FileSystemDirectoryHandle> => {
  let handle = dir
  for (const name of segments(path)) handle = await handle.getDirectoryHandle(name, { create })
  return handle
}

// A path split into the directory holding it and the name inside that directory, which is what
// every file operation actually needs.
const locate = async (
  dir: FileSystemDirectoryHandle,
  path: string,
  create: boolean
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> => {
  const parts = segments(path)
  const name = parts.pop()
  if (name === undefined) throw new Error(`"${path}" names no file`)
  return { parent: await directoryAt(dir, parts.join("/"), create), name }
}

const isNotFound = (e: unknown): boolean => e instanceof DOMException && e.name === "NotFoundError"

export const readBlob = async (dir: FileSystemDirectoryHandle, path: string): Promise<Blob> => {
  const { parent, name } = await locate(dir, path, false)
  return (await parent.getFileHandle(name)).getFile()
}

export const readText = async (dir: FileSystemDirectoryHandle, path: string): Promise<string> =>
  (await readBlob(dir, path)).text()

export const exists = async (dir: FileSystemDirectoryHandle, path: string): Promise<boolean> => {
  try {
    const { parent, name } = await locate(dir, path, false)
    // Either kind counts: the caller asked whether the path is taken, not what took it.
    await parent.getFileHandle(name).catch(() => parent.getDirectoryHandle(name))
    return true
  } catch (e) {
    return false
  }
}

// Serialized per path, so two writes to one file cannot interleave. That is *not* about atomicity -
// see writeNow, which needs no help there - it is about ordering: chaining makes the last write win,
// which is what a debounced store wants, where letting two race leaves whichever finishes last in
// place regardless of which was newer.
//
// Keyed on the path alone rather than on the handle. A handle is a fresh object on every
// `getDirectoryHandle`, so keying on one would silently stop serializing; the cost is that two
// different directories holding the same relative path serialize with each other, which is
// over-serializing and therefore safe. The real caller addresses everything from the OPFS root, so
// its paths are already distinct.
const inFlight = new Map<string, Promise<void>>()

export const writeFile = (dir: FileSystemDirectoryHandle, path: string, data: Blob | string): Promise<void> => {
  const previous = inFlight.get(path) ?? Promise.resolve()
  // The previous write's failure is its caller's to see, not this one's reason not to run.
  const write = previous.catch(() => undefined).then(() => writeNow(dir, path, data))
  inFlight.set(path, write)
  void write
    .catch(() => undefined)
    .then(() => {
      if (inFlight.get(path) === write) inFlight.delete(path)
    })
  return write
}

// A plain write, because the File System Standard already makes one atomic, and the scheme this
// layer used to put on top made things worse rather than better.
//
// The spec is normative that "any changes made through stream won't be reflected in the file entry
// locatable by fileHandle's locator until the stream has been closed", and says user agents "try to
// ensure that no partial writes happen, i.e. the file will either contain its old contents or it
// will contain whatever data was written through stream up until the stream has been closed". The
// swap file is how that is typically implemented and is explicitly non-normative: Chromium writes
// `<name>.crswap` beside the target and replaces it on close, which nothing here ever sees - the
// "leaves nothing beside the file" test is what pins that.
//
// This used to write `<name>.tmp` and `move()` it into place, on the belief that createWritable
// truncates the target so a crash mid-write would leave script.yaml short. That belief was wrong:
// by the visibility rule above the old contents stand until close, so there was no short window to
// protect. Worse, the tmp file was *itself* written with createWritable, so it hedged that primitive
// with itself and hedged nothing - while adding a failure mode of its own, since a crash between
// close and move leaves a stray `<name>.tmp` that the walk, the listing and an export would each
// pick up as if it were the author's. Dropped 2026-08-30 with the `move()` feature detect it needed
// (move() is a Chromium addition and is not in the spec at all).
//
// What is *not* covered is an engine that ignores the visibility rule and writes in place: "try to
// ensure" is not "must", and Firefox shipped then backed out its OPFS implementation once. If one
// turns up, the answer is a tmp file written through whatever primitive that engine does get right,
// which is a ticket with a reproduction attached rather than the guess this was.
const writeNow = async (dir: FileSystemDirectoryHandle, path: string, data: Blob | string): Promise<void> => {
  const { parent, name } = await locate(dir, path, true)
  const handle = await parent.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
}

// The directory names directly under `path`. A path that is not there lists as empty rather than
// throwing: "what projects exist" is a question with an answer before anything has been stored.
export const listDirectories = async (dir: FileSystemDirectoryHandle, path: string): Promise<string[]> => {
  const start = await directoryAt(dir, path, false).catch(() => null)
  if (start === null) return []
  const names: string[] = []
  for await (const [name, handle] of start.entries()) {
    if (handle.kind === "directory") names.push(name)
  }
  return names
}

// Every file under a tree, with paths relative to where the walk started. A generator rather than an
// array because its callers differ: enumeration wants the first few entries, a size total wants all
// of them, and the recursive copy a rename needs wants to write as it reads.
export async function* walk(dir: FileSystemDirectoryHandle, path = ""): AsyncGenerator<WalkedFile> {
  const start = await directoryAt(dir, path, false).catch(() => null)
  if (start === null) return
  yield* walkFrom(start, "")
}

async function* walkFrom(dir: FileSystemDirectoryHandle, prefix: string): AsyncGenerator<WalkedFile> {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix === "" ? name : `${prefix}/${name}`
    if (handle.kind === "directory") {
      yield* walkFrom(handle as FileSystemDirectoryHandle, path)
    } else {
      const file = handle as FileSystemFileHandle
      yield { path, handle: file, size: (await file.getFile()).size }
    }
  }
}

// A path that is not there is already gone, so removing it is not an error - the sweep that deletes
// a crashed rename's residue runs over paths it is not sure about.
export const removeRecursive = async (dir: FileSystemDirectoryHandle, path: string): Promise<void> => {
  try {
    const { parent, name } = await locate(dir, path, false)
    await parent.removeEntry(name, { recursive: true })
  } catch (e) {
    if (!isNotFound(e)) throw e
  }
}
