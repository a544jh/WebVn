# OPFS primitives: atomic writes, walk, delete

Status: done (2026-08-30)

The filesystem layer the project store is built on, knowing nothing about manifests, projects or ids.
`design-docs/PROJECT_STORAGE.md`, "Storage: OPFS" and "Load-bearing details". Its own ticket because
two of the three hard parts here - atomicity and feature detection - are decisions about the
platform rather than about this application, and mixing them into the store would bury them.

## `src/storage/opfs.ts`

A module of functions, camelCase per the repo's naming convention, no class. Every function takes the
directory handle it works under, so nothing here holds global state and tests can point it at a
scratch directory.

```ts
export const opfsRoot = (): Promise<FileSystemDirectoryHandle>
export const isSupported = (): boolean

export const readText = (dir: FileSystemDirectoryHandle, path: string): Promise<string>
export const readBlob = (dir: FileSystemDirectoryHandle, path: string): Promise<Blob>
export const writeFile = (dir: FileSystemDirectoryHandle, path: string, data: Blob | string): Promise<void>
export const exists = (dir: FileSystemDirectoryHandle, path: string): Promise<boolean>

export const listDirectories = (dir: FileSystemDirectoryHandle, path: string): Promise<string[]>
export const walk = (dir: FileSystemDirectoryHandle, path?: string): AsyncGenerator<WalkedFile>
export const removeRecursive = (dir: FileSystemDirectoryHandle, path: string): Promise<void>
```

`path` is always slash-separated and relative to `dir`; splitting it and walking the segments happens
in one internal helper, not at each call site.

`WalkedFile` carries at least the relative path and the `FileSystemFileHandle`, and should carry the
size - `getFile().size` is already in hand during the walk, and the library UI's per-project figure
has nowhere else to come from (`navigator.storage.estimate()` is origin-wide). Cheaper to yield now
than to add a second walk later.

## Atomic writes are not optional

`writeFile` writes `<name>.tmp` beside the target and then `move()`s it into place. The doc is
explicit that this is load-bearing rather than a nicety: storing (ticket 05) writes constantly, and
a tab killed mid-write to `script.yaml` truncates the author's work with no other copy anywhere.

Two things to get right:

- **`move()` needs a feature detect.** It is not in the WHATWG FS spec at all, and Firefox shipped
  then backed out its OPFS implementation once. Detect it on the handle (`typeof handle.move ===
  "function"`); without it, fall back to a direct write and leave a comment saying plainly that a
  crash mid-write can truncate on that path. There is no atomic alternative, so the fallback is a
  known degradation rather than a bug to fix later.
- **Two writes to one path must not share a tmp name.** Debounced storing can start a second write
  while the first is between its write and its move, and both would be using `script.yaml.tmp`.
  Serialize per path (a `Map<string, Promise<void>>` of in-flight writes, chained) or make the tmp
  name unique per write. Serializing is preferable: it also makes the last write win, which is what a
  debounced save wants, whereas unique names make two concurrent writes race to be last.

## What the browser actually provides

Measured in this repo's browser vitest project (headless Chromium via Playwright), not assumed:

- `navigator.storage.getDirectory()` works, and the OPFS root came up **empty at the start of a
  run**, so runs do not inherit each other's files. Within a run they would, hence `clearOpfs()`
  below.
- **`FileSystemFileHandle.move()` exists.** The atomic write below is therefore testable rather than
  aspirational, and the fallback path is for other engines, not for the one the tests run in.
- `FileSystemDirectoryHandle.entries()` / `keys()` exist at runtime. Only the *types* are missing.
- **`createSyncAccessHandle` is `undefined` on the main thread.** It is worker-only by design, so it
  cannot be feature-detected from where this module runs without spawning a worker first.

## Feature detection, and what to do when it fails

The doc leaves the `createWritable()` question open - Safari support has been uneven, and the
alternative is a dedicated worker plus `createSyncAccessHandle()`, which is the surface every OPFS
implementation has.

**Do not build the worker path in this ticket.** It is a whole second implementation of the write
half, justified by reports rather than by a measurement, and it would land untested against the
browser it exists for. And per the measurement above, detecting whether it is even *needed* costs a
worker, so the detection is not free either. If a real browser turns out to require it, that is a
ticket with a reproduction attached.

So `isSupported()` checks `navigator.storage?.getDirectory` and `createWritable` on a handle, and
**a browser that fails it does not get an editor at all.** The editor's boot refuses, the way
`showLoadError` already refuses for the player - see ticket 05. There is deliberately no
memory-only editor: a second boot path that works differently and is exercised by nobody is a
maintenance cost with no owner, and an editor that silently cannot store is worse than one that says
so. The *player* is unaffected either way, since it never touches OPFS.

Record what current Safari actually does if a Safari is available - that measurement is one of the
doc's open questions and this is the moment someone is looking.

## Type declarations `lib.dom` does not have

Checked against the TypeScript in the tree, so this is what will actually be missing - and note it
does not match what the *runtime* has, per the measurements above:

- `navigator.storage.getDirectory()`, `estimate()`, `persist()`, `persisted()`, `createWritable()`,
  `getFileHandle`, `getDirectoryHandle` and `removeEntry` are all **present**.
- `FileSystemDirectoryHandle`'s async iteration - `entries()`, `values()`, `keys()` - is **absent**
  from the types while present at runtime.
- `FileSystemFileHandle.move()` is **absent** from the types, which follows from it not being in the
  spec, and is likewise present at runtime in Chromium.

So this ticket adds `src/types/fileSystem.d.ts`, declaring those back exactly as
`src/types/screenOrientation.d.ts` declares `ScreenOrientation.lock`: a global augmentation with no
imports or exports, picked up because `tsconfig.json` has no `include`. Follow that file's comment
style - say why lib.dom lacks each one, because the next reader's first instinct will be that the
declaration is a mistake. `for await` over the declared `AsyncIterable` compiles fine under the
repo's `target: es6`; that was verified, not assumed.

## Tests

`test/browser/` - OPFS is a browser API, and a test misfiled under `test/unit/` dies on a missing
`navigator.storage` rather than failing usefully.

OPFS is per-origin and persists across test files in one browser session, so **the suite needs a
clean slate helper**: add `clearOpfs()` to `test/helpers/` (remove every entry under the root) and
call it in `beforeEach`, the same role `createVnRoot`'s `localStorage.clear()` plays for the DOM
suites. Prefer working inside a scratch subdirectory over writing at the root, so a test that leaks
cannot confuse a later one.

Worth covering:

- write then read round-trips text and binary
- a write to a nested path creates the directories on the way
- `walk` yields every file under a tree, with paths relative to where it started, and nothing for an
  empty directory
- `removeRecursive` empties a populated tree, and does not throw on a path that is not there
- **the tmp file does not survive a successful write** - `walk` after a write yields `script.yaml` and
  no `script.yaml.tmp`. This is the one that catches a fallback path that forgot to clean up.
- two writes to the same path in flight at once leave the file with one of the two contents intact
  and no tmp file behind

## Not in scope

- Anything that knows what a project is. Ticket 04.
- The recursive *copy* a rename needs. It is the same walk plus a write per file, and it belongs with
  the rename ticket that is its only caller until zip export exists.
- `persist()` and `estimate()`. They are library-UI concerns and land with the nag ticket in tranche
  2; this layer just makes sure `walk` yields the sizes that ticket will need.
