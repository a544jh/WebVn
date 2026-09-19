import { opfsRoot, removeRecursive } from "../../src/storage/opfs"
import { readProject, setStoreRoot } from "../../src/storage/projectStore"

// OPFS is per-origin and outlives a test file, and the browser suites run their files in parallel
// against one origin - so a suite that writes into it needs both a clean slate and a corner of its
// own. `createVnRoot`'s `clearSaves` plays the first role for the DOM suites - scoped to the ids a
// suite owns, because localStorage is origin-wide too and a blanket clear was doing to saves exactly
// what a shared scratch name does to files; the scratch directory is what plays the second, so a
// test that leaks cannot confuse a suite running beside it.
//
// **The name has to be unique per suite, and that is on the caller.** Three suites shared one name
// until 2026-09-05 and passed anyway, which is the whole problem: their `beforeEach` calls interleave
// milliseconds apart - measured, by tagging each module instance and logging timestamps - so one
// suite was clearing the directory another was mid-test in, and nothing failed until it would have.

// An empty scratch directory of the given name, and a handle to it. Call from `beforeEach`.
export const clearOpfs = async (name: string): Promise<FileSystemDirectoryHandle> => {
  const root = await opfsRoot()
  await removeRecursive(root, name)
  return root.getDirectoryHandle(name, { create: true })
}

// The same, for a suite that exercises the project store, plus pointing the store at it. The store
// addresses one root rather than taking a directory per call, so pointing that root somewhere is
// what scoping it to a suite means. Pass a name no other suite uses.
export const clearOpfsStore = async (name: string): Promise<FileSystemDirectoryHandle> => {
  const dir = await clearOpfs(name)
  setStoreRoot(() => Promise.resolve(dir))
  return dir
}

// The directory the store is currently pointed at, for a test that wants to reach past the store's
// API and write a project by hand - which is how the malformed cases get set up. Same name the
// suite gave `clearOpfsStore`.
export const storeRoot = async (name: string): Promise<FileSystemDirectoryHandle> =>
  (await opfsRoot()).getDirectoryHandle(name, { create: true })

// A project's stored manifest, or null if it could not be read. **For polling a write that is
// landing underneath**, which is what every "did this reach the store" assertion now does: a write
// the editor makes itself is stored at once rather than after a flush, so a test reads while
// Chromium has a `.crswap` file open beside the target, and `getFile()` is refused with
// `NotReadableError` for as long as both exist. A poll that let that reject would fail on the very
// write it was waiting for. Read `walk`'s comment in src/storage/opfs.ts for the other half of the
// same hazard.
export const storedManifest = async (directory: string): Promise<string | null> => {
  try {
    return (await readProject(directory)).manifestText
  } catch {
    return null
  }
}
