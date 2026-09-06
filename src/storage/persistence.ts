// navigator.storage.persist(), which is about **eviction** rather than quota: a persisted origin is
// one the browser will not clear on its own when it is short of space. An author's only copy of
// their project lives in OPFS until there is an export, so this is worth asking for - and worth
// reporting honestly, because it can be refused.
//
// Its own file rather than a corner of projectStore.ts: this is the origin's business, not the
// project layout's, and the store is deliberately about where a project's files sit. Both halves of
// `navigator.storage` live here - what the browser promises to keep, and how much room it says is
// left - which are different questions with the same owner.

// Asked at most once per page load. `persist()` is a permission request - Firefox prompts - so a
// storer per project session must not mean a prompt per project switch. The answer is remembered
// rather than the call repeated, which also makes "did we ask, and what did it say" one thing.
let asked: Promise<boolean> | null = null

// Ask for persistence, and **report what it answered rather than assuming it succeeded**. The
// caller is the first store: by then the author has committed work, so a prompt lands on someone who
// is invested rather than on someone who just arrived.
export const requestPersistence = (): Promise<boolean> => {
  if (asked === null) asked = ask()
  return asked
}

const ask = async (): Promise<boolean> => {
  if (typeof navigator.storage?.persist !== "function") {
    console.warn("This browser cannot be asked to keep the project store, so it may be evicted under storage pressure")
    return false
  }
  const granted = await navigator.storage.persist().catch(() => false)
  if (!granted) {
    console.warn("The browser refused to keep the project store, so it may be evicted under storage pressure")
  }
  return granted
}

// How many bytes this origin could still write, as the browser estimates it. Null when it will not
// say, which is a reason to proceed rather than to refuse: an unknown budget is not a small one.
//
// **Quota, not eviction** - the opposite half of this file from `persist()` above, and they do not
// help each other. A rename copies a project before deleting the original, so it needs room for a
// second copy and dies partway with `QuotaExceededError` if it is not there; persisting the origin
// would not have bought a single byte.
export const availableBytes = async (): Promise<number | null> => {
  if (typeof navigator.storage?.estimate !== "function") return null
  const { quota, usage } = await navigator.storage.estimate().catch(() => ({ quota: undefined, usage: undefined }))
  if (quota === undefined || usage === undefined) return null
  return Math.max(0, quota - usage)
}

// How much a number of bytes is, said to an author rather than to a machine. Here because every
// caller of it is a caller of `availableBytes` above: a rename asking whether a second copy will
// fit, and an import asking whether an archive will. One decimal place, and the SI megabyte the
// browser's own estimate is quoted in.
export const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`

// Whether the origin is persisted *now*. Read fresh on every picker render rather than cached: the
// answer changes when the request above is granted, and a browser may revoke it.
export const isPersisted = async (): Promise<boolean> => {
  if (typeof navigator.storage?.persisted !== "function") return false
  return navigator.storage.persisted().catch(() => false)
}
