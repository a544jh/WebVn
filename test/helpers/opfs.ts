import { opfsRoot } from "../../src/storage/opfs"

// OPFS is per-origin and outlives a test file within one browser session, so a suite that writes
// into it needs a clean slate the way the DOM suites need `createVnRoot`'s `localStorage.clear()`.
// (The root does come up empty at the *start* of a run - runs do not inherit each other's files -
// so this is about tests within one run.)
//
// Working inside a scratch subdirectory rather than at the root is what keeps a test that leaks
// from confusing a later one: everything a test writes is under one name, and clearing is one
// removal rather than a walk of whatever happens to be there.
const SCRATCH = "test-scratch"

// An empty scratch directory, and a handle to it. Call from `beforeEach`.
export const clearOpfs = async (): Promise<FileSystemDirectoryHandle> => {
  const root = await opfsRoot()
  await root.removeEntry(SCRATCH, { recursive: true }).catch(() => undefined)
  return root.getDirectoryHandle(SCRATCH, { create: true })
}
