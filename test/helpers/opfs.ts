import { opfsRoot, removeRecursive } from "../../src/storage/opfs"
import { setStoreRoot } from "../../src/storage/projectStore"

// OPFS is per-origin and outlives a test file, and the browser suites run their files in parallel
// against one origin - so a suite that writes into it needs both a clean slate and a corner of its
// own. `createVnRoot`'s `localStorage.clear()` plays the first role for the DOM suites; the scratch
// directory is what plays the second, so a test that leaks cannot confuse a suite running beside it.

// An empty scratch directory of the given name, and a handle to it. Call from `beforeEach`.
export const clearOpfs = async (name: string): Promise<FileSystemDirectoryHandle> => {
  const root = await opfsRoot()
  await removeRecursive(root, name)
  return root.getDirectoryHandle(name, { create: true })
}

const STORE_SCRATCH = "test-scratch-store"

// The same, for a suite that exercises the project store. The store addresses one root rather than
// taking a directory per call - `listProjects()` has no useful third argument - so pointing that
// root at a scratch directory is what scoping it to a test means.
export const clearOpfsStore = async (): Promise<FileSystemDirectoryHandle> => {
  const dir = await clearOpfs(STORE_SCRATCH)
  setStoreRoot(() => Promise.resolve(dir))
  return dir
}

// The directory the store is currently pointed at, for a test that wants to reach past the store's
// API and write a project by hand - which is how the malformed cases get set up.
export const storeRoot = async (): Promise<FileSystemDirectoryHandle> =>
  (await opfsRoot()).getDirectoryHandle(STORE_SCRATCH, { create: true })
