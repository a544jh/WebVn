// One tab per project. design-docs/PROJECT_STORAGE.md, "Load-bearing details": two tabs on one
// project race the editor's storing.
//
// This closes a hazard that storing itself created. Before there was persistence a second editor tab
// cost nothing - two independent in-memory sessions, and the loser is whoever forgets to copy their
// text out. After it there is exactly one copy of the author's work, two tabs both storing on a
// debounce, and last writer wins per file, so one tab's edits vanish silently. The store indicator
// makes that worse rather than better: the losing tab still reads "stored", which is true about
// bytes that have since been overwritten, and a truthful indicator over a lossy write is a more
// convincing lie than no indicator at all.

// A held lock. `release` exists for tests: a real tab releases by going away, which is the property
// that makes Web Locks safe against a crash - unlike a flag in editor.yaml, which a killed tab would
// leave set forever and which would need a liveness heuristic to clear. Do not build a lock out of
// stored state.
export interface ProjectLock {
  // Resolves once the lock is actually gone, which is a turn or two after the ask: the Web Locks API
  // releases when the callback's promise settles, and that settling is itself asynchronous. A caller
  // that re-requests without awaiting this is still refused.
  release(): Promise<void>
}

// navigator.locks needs a secure context, exactly like OPFS, so anything that can run the editor can
// take a lock and there is no new feature detection to do. Asserted rather than assumed: if it is
// somehow absent the boot refuses, the way an unsupported browser is refused, rather than proceeding
// unlocked.
export const areLocksSupported = (): boolean => typeof navigator !== "undefined" && navigator.locks !== undefined

// Keyed on the **directory**, not the manifest's id, because storing addresses the directory - a
// lock keyed on the id would stop guarding the files being written the moment an author edits `id:`.
const lockName = (directory: string): string => `vn-project-${directory}`

// Null when another tab holds it. `ifAvailable` rather than waiting: a tab that silently blocks on a
// lock looks like a hung editor, so ask, fail fast, and say so.
export const takeProjectLock = async (directory: string): Promise<ProjectLock | null> => {
  const granted = deferred<boolean>()
  // Held for the lifetime of the session. The Web Locks API expresses that as a callback whose
  // promise does not resolve, so this one is only ever settled by `release` below.
  const holding = deferred<void>()

  const request = navigator.locks.request(lockName(directory), { mode: "exclusive", ifAvailable: true }, (lock) => {
    if (lock === null) {
      granted.resolve(false)
      // Returning settles the request immediately, which is right: there is nothing held.
      return
    }
    granted.resolve(true)
    return holding.promise
  })
  // Without this, a request that rejects before the callback runs is an unhandled rejection and the
  // await below never returns.
  request.catch(() => granted.resolve(false))

  if (!(await granted.promise)) return null
  return {
    release: async () => {
      holding.resolve()
      // The request settles only once the lock is actually released, which is what a caller has to
      // await before it can be granted again.
      await request
    },
  }
}

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
