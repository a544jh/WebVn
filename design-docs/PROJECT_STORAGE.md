# Project storage

How an author's project is held while they are editing it, and how it leaves the browser.

Status: design, nothing here is implemented yet. Written up so the reasoning survives; expect the details to
move as it gets built. The constraint the whole document is shaped by: no cloud, no accounts, no server. A
free, open-source tool with no strings attached cannot have a backend, so everything below happens on the
author's own machine.

## Two different things are called "saving"

These keep getting conflated and they are unrelated:

- **Player saves.** Where a player is in a story: `[...decisions, remainingAdvances]` plus `seenCommands`, in
  localStorage under `vn-<id>`. Tiny, already works, described in the save/load section of `CLAUDE.md`. Not
  what this document is about, except for one consequence in "Load-bearing details" below.
- **Project persistence.** The author's script, assets and metadata. Does not exist yet at all. This is the
  hard one, and it is what follows.

## Prerequisite: assets have to become project data

Today a project cannot declare its own assets. `actors`, `backgrounds` and `audioAssets` live in
`src/demoStory.ts` as a hardcoded `VnPlayerState`, and reach the parser through `baseState` - see the comment
at `src/yamlParser/YamlParser.ts:21`. The YAML supplies the story; everything else is a TypeScript constant
compiled into the bundle. No storage design can work until that moves into the project.

The second prerequisite is an indirection between "logical asset key" and "URL to fetch". Right now the path
is built by string concatenation at seven call sites:

- `src/domRenderer/DomRenderer.ts:399,406,411` (`sprites/<actor>/<file>`, `backgrounds/<file>`, `audio/<file>`)
- `src/domRenderer/BackgroundRenderer.ts:77,128,160`
- `src/domRenderer/SpriteRenderer.ts:167`
- `src/domRenderer/AudioRenderer.ts:16,27`

and lands in `img.src = path` / `new Audio(path)`, resolved as a relative URL against the document. That is
convenient: **anything that produces a URL is already a valid backend**, because `URL.createObjectURL(blob)`
drops into `ImageAssetLoaderSrc` and `AudioAssetLoaderSrc` unchanged.

So introduce an `AssetResolver` - logical key in, URL out, possibly async - with implementations for the
current relative-path scheme (deployed builds, the demo) and for a project store. Do this first and the
storage choice stops being architectural; it becomes one class. It also de-duplicates path building across
four files.

## Storage: OPFS

The working copy lives in the Origin Private File System, reached through
`navigator.storage.getDirectory()`.

**Durability is not what picks the backend.** OPFS, IndexedDB, the Cache API and localStorage share one origin
quota, one eviction policy, and all die together on "Clear site data". Safari additionally deletes
script-created storage after seven days without user interaction with the origin. Whatever we pick, browser
storage is a good working copy and a bad only copy - which is why the export path in "Leaving the browser" is
a safety net rather than a nicety.

What OPFS wins on:

- **The same interface as a real folder.** `showDirectoryPicker()` and `navigator.storage.getDirectory()` both
  return a `FileSystemDirectoryHandle`. If the optional "link this project to a folder on disk" layer is ever
  built, it is a handle swap, not a second implementation. This is the strongest argument.
- **The path model is already ours.** `sprites/A1/idle.png` is what `DomRenderer` builds today, what the
  export zip contains, and what a linked folder would hold. With a key-value store we would reimplement
  directory semantics on top of a flat map.
- **Streaming writes.** An import can pipe an archive entry to disk without materializing it in memory.

What it costs:

- **No cross-file atomicity.** IndexedDB has transactions; OPFS has per-file writes. Mitigated by writing
  `x.tmp` then `FileSystemFileHandle.move()`, which has shipped for OPFS-internal files in all three engines.
  Not optional - see "Load-bearing details".
- **`createWritable()` support has been uneven**, Safari in particular. Feature-detect at runtime and keep a
  dedicated-worker plus `createSyncAccessHandle()` path, which is the surface every OPFS implementation has.
  Worth re-checking against real browsers before relying on either.
- **Weak DevTools.** IndexedDB has a first-class viewer everywhere; OPFS inspection is patchy. A real cost
  when a non-developer reports that their project vanished.

**IndexedDB is needed only for one thing**, and only if the linked-folder layer ships: a
`FileSystemDirectoryHandle` is structured-cloneable but not serializable, so IndexedDB is the only storage API
on the platform that can persist it. `JSON.stringify(handle)` gives `{}`, localStorage takes strings, OPFS
files take bytes. Project metadata does *not* need it - that belongs in OPFS, where it is evicted atomically
with the data it describes instead of drifting out of sync with it.

## Layout

```
projects/
  <project-id>/
    manifest.yaml
    script.yaml
    assets/
      sprites/<actor>/<file>
      backgrounds/<file>
      audio/<file>
editor.yaml
```

`editor.yaml` sits beside `projects/`, not inside a project. It holds the editor's own bookkeeping - last
opened, last exported, a rename in flight - none of which is project data and none of which should travel in
an export. Keeping it outside the project directories is what lets a `.webvnproj` stay *the whole
`projects/<project-id>/` tree*: export is a straight walk, import a straight copy, with nothing to strip.
It belongs in OPFS rather than localStorage for the same reason the manifest does - it is evicted atomically
with the data it describes instead of drifting out of sync with it.

`manifest.yaml` is a separate file from `script.yaml`, and YAML rather than JSON so it uses the parser and the
dependency already in the tree, and so a human can read it in the export. It holds project identity plus the
asset declarations that currently live in `demoStory.ts`:

```yaml
id: my-story        # author-chosen, restricted charset, also the directory name
title: My Story
formatVersion: 1
actors:
  A1:
    name: Actor
    nameTagColor: purple
    sprites: [idle.png, "2.png"]
backgrounds: [a.png, b.png]
audioAssets: [bgm/map01.ogg, sfx/bigthump.ogg]
```

Validate it with Zod, matching how commands are already parsed (`makeZodCmdHandler`).

**The id is author-chosen, not a UUID, and it is the directory name.** An earlier draft used a UUID
precisely so that renaming would never have to move a directory. That was traded away deliberately: a
readable id collapses the directory name, the player-save key, the exported filename and the published folder
into one string the author can say out loud, and it makes the "the project id must be embedded in the
exported story, not derived from its OPFS location" rule below a tautology rather than a convention someone
has to remember. The `title` stays a separate free-text field; the id is never derived from it.

The cost is that a rename is now a directory move, and there is no directory move - see "Renaming" below.

**Charset: `^[a-z0-9][a-z0-9_-]{0,63}$`, plus a reserved-name blocklist.** The id has to survive being a path
segment, a URL segment and a localStorage key suffix, but the binding constraints come from the *export*,
which is a zip extracted onto a real filesystem:

- **Lowercase only.** OPFS is case-sensitive; Windows and default macOS are not. Without case folding,
  `MyStory` and `mystory` are two valid projects in the library that collide on extraction.
- **Windows reserved names** are rejected outright: `CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`,
  along with `.`, `..`, and any leading or trailing dot or space.

The id is mandatory at creation - it is the directory name, so it must exist before the first write. There is
no unnamed-project state.

**Uniqueness is per-library, not global.** Two authors may both pick `demo`, and if both publish under the
same origin their players share a save key. The UUID scheme avoided this by accident. It is an accepted
non-guarantee, not an oversight.

### Renaming

**The rename is triggered from the manifest, on editor blur.** That is already when the script is reparsed,
so the id change is noticed on the same event rather than needing a new one: blur, see that `id` differs from
the directory name, show the dialog. Declining reverts the `id` field alone and keeps every other edit in the
buffer. Blur is a rough trigger - it fires on incidental focus changes and never fires on a tab close - which
is survivable only because the startup reconcile below catches whatever it misses. Refining it is a UI
question, not a storage one.

**No engine supports moving a *directory*.** `FileSystemHandle.move()` is not in the WHATWG FS spec at all -
[whatwg/fs#10](https://github.com/whatwg/fs/pull/10) is still open, and MDN's compat data marks the method
`standard_track: false`. Chrome's implementation is explicitly partial: the method is exposed on
`FileSystemFileHandle` only, never on `FileSystemDirectoryHandle` ([crbug 40198034](https://crbug.com/40198034)).
Firefox and Safari are unverified for directories - Firefox's OPFS `move()`
([bug 1789116](https://bugzilla.mozilla.org/show_bug.cgi?id=1789116)) landed and was backed out once over WPT
failures. Chrome alone settles it: **rename is a recursive copy followed by a recursive delete, with no
feature-detected fast path.** A second code path for engines that might have directory move is not worth
maintaining for an operation this rare.

That is cheaper than it sounds. The copy is a recursive directory walk - the same walk export does into a zip
and import does out of one. One shared helper, three callers.

Two things do need care:

- **Quota, not time.** Streaming each file (`blob.stream().pipeTo(writable)`) keeps memory bounded and OPFS
  copies are local disk I/O, so a progress indicator covers the wall clock. But the old tree survives until
  the new one is complete, so a rename needs 2x the project size free and dies halfway with
  `QuotaExceededError` if it is not. Check `navigator.storage.estimate()` up front and refuse with a clear
  message rather than failing partway. `persist()` does not help here - that is eviction, not quota.
- **Interruption.** A killed tab mid-copy leaves a partial tree. The ordering below makes every crash state
  recoverable:

  1. Record `pendingRename: { from, to }` in `editor.yaml`.
  2. Copy `script.yaml` and `assets/` into `projects/<new-id>/`, **manifest last**.
  3. Write `projects/<new-id>/manifest.yaml` with the new id. This single atomic file write is the commit
     point.
  4. Recursively delete `projects/<old-id>/`, then clear `pendingRename`.

  Recovery runs at startup, and re-verifies against the tree before acting - the marker can never by itself
  cause a delete. Crash before step 3 and the destination has no manifest, so it is swept and the source is
  untouched; crash between 3 and 4 and the destination is valid, so the delete is finished.

  `pendingRename` is a single slot, not a per-project field: one project is open at a time, under the
  `navigator.locks` lock below, so two renames cannot overlap and "is a rename in flight" is one check at
  startup rather than a scan.

**A `pendingRename` marker is a hint, not a source of truth.** Lose `editor.yaml` and recovery degrades to
what enumeration alone can prove - *no manifest* means garbage, *manifest without `script.yaml`* means
incomplete - which covers everything except a fully-copied-but-partial asset tree, and leaves at worst a
duplicate project for the author to delete. Never a wrong delete. That is the "Enumeration is the truth"
rule below, holding even for the one field that cannot be rebuilt from the tree.

**Overwrite is confirmed, then done first.** If the destination id already exists the author gets an explicit
"this will be overwritten" dialog - the same confirmation an import that collides with an existing id gets,
since it is the same destructive operation. On confirmation the destination is recursively deleted *before* step 1, so
the "no manifest means garbage" invariant holds throughout; the destructive step happens up front rather than
interleaved with the copy. The residual risk - destination deleted, then the copy fails on quota - is why the
estimate check comes first.

There is no "keep the old id as a copy" option. Duplicating a project is a real feature and belongs as its
own action in the library, not as a checkbox on a rename dialog: it would double the storage cost of a rename
under quota pressure and silently leave behind a project the author did not ask to create.

**Enumeration is the truth; any index is a rebuildable cache.** A crash between creating a project directory
and updating a `projects.yaml` leaves the two disagreeing, and a directory listing cannot lie. Rebuild the
index from the tree whenever it is missing or inconsistent, and "my project exists but does not show up"
stops being a possible bug.

## Multiple projects

The editor holds a library of projects, not a single loaded one.

The deciding argument is that single-project makes import destructive: "open a `.webvnproj`" would mean
"destroy whatever you were working on", guarded by a confirm dialog whose real question is "did you remember
to export?". With a library, import is additive and boring.

This also matches what comparable tools do. Browser tools that can reach real files (vscode.dev, Photopea,
draw.io) are document-centric and let the filesystem be the library. Tools whose users cannot be assumed to
manage files and which refuse to require an account (Twine, Scratch, Construct 3, the Godot web editor) own a
project list in browser storage. Twine is the near-exact precedent - hypertext authoring, non-developer
writers, no account - and it is also the cautionary tale: its most common support thread for a decade has been
someone losing their whole library to cleared browser data. Hence the export nagging below.

**Sequencing: build the layout for many, ship the UI for one.** `projects/<project-id>/...` from the first commit
costs nothing and removes the migration entirely; the picker can arrive whenever it is convenient.

**The runtime stays strictly single.** `VnPlayer`, `DomRenderer` and the resolver never learn that other
projects exist. Switching projects is a full teardown and remount through the same path as initial boot, never
a live swap. `DomRenderer.render` already carries a generation guard for overlapping renders (see the renderer
contract in `CLAUDE.md`); a project swap mid-render would be a new class of the same bug, and there is no
reason to invite it.

## Leaving the browser

**The canonical artifact is a `.webvnproj` file on the author's disk. The OPFS library holds working copies.**
That framing is what makes eviction survivable, makes a "last exported N days ago" nag principled rather than
paranoid, and gives the linked-folder layer a natural place to live.

The format is a zip, not gzip. Media is already compressed, so gzipping the bundle buys close to nothing while
making it opaque; a zip is inspectable, and store-mode entries for media keep import a straight copy. It is
the whole `projects/<project-id>/` tree, manifest included.

`@zip.js/zip.js` is the intended library: zero dependencies, BSD-3, actively maintained, and it reads the
central directory through a `BlobReader` so entries are extracted by random access rather than by streaming
the whole archive. A `File` from a picker or a drop is disk-backed, so `file.slice()` reads ranges off disk
and never holds the archive in memory. Crucially `getData()` accepts a `WritableStream` directly, so an entry
pipes straight into OPFS with no intermediate Blob:

```ts
const reader = new ZipReader(new BlobReader(file))
for (const entry of await reader.getEntries()) {
  if (entry.directory) continue
  const handle = await ensureFile(root, entry.filename)
  await entry.getData(await handle.createWritable())
}
await reader.close()
```

It also ships `HttpRangeReader` (read a project off any static host, pulling only the entries touched) and
OPFS temp-stream helpers that bound peak memory while *writing* an archive. Open question: the shipped bundles
gzip to about 79-85KB, but those include mime tables, encryption and wasm codecs. Modular entry points exist
(`lib/zip-core-reader.js`, `lib/zip-core-native.js`, the latter delegating to `DecompressionStream`), so a
reader-only build should be far smaller - it has not been measured, and that measurement is what decides
zip.js against the lighter unzipit plus client-zip pairing. Note also that zip.js spawns web workers by
default, which is exactly the kind of thing the webpack config in `CLAUDE.md` is fragile about.

Publish targets, none of which need a server we run: a static folder, a single-file HTML export with assets
inlined as data URIs (pleasant below ~20MB, silly above ~100MB), or a zip dropped on itch.io, GitHub Pages or
Neocities - which is the free "cloud" without us hosting anything.

**Consequence of splitting the manifest out:** `?vn=<gzipped script>` no longer describes a complete story,
since the asset and actor declarations are in `manifest.yaml`. The intended fix is to make the URL payload a
two-document YAML stream - manifest, `---`, script - which the `yaml` dependency already parses via
`parseAllDocuments`, and which stays small under gzip. Assets themselves can never travel in a URL, so a
shared link with custom assets also needs a base URL for them, e.g. `&assets=<url>`. That is worth having
anyway: it makes reusable asset packs possible.

## Load-bearing details

Things that will break quietly if they are skipped.

- **Every OPFS write goes `x.tmp` then `move()`.** Autosave writes constantly; a crash or tab kill mid-write
  to `script.yaml` truncates the author's work. This is `FileSystemFileHandle.move()` - files, inside OPFS,
  which is the one case every engine implements. It is still worth a feature detect: the method is not in the
  WHATWG FS spec (see "Renaming"), and Firefox shipped then backed out its OPFS implementation once. There is
  no atomic alternative, so the degraded path is a direct write plus an acknowledgement that a crash mid-write
  can truncate.
- **Object URLs must survive until story teardown.** `ImageAssetLoaderSrc.getAsset` and
  `AudioAssetLoaderSrc.getAsset` return `cloneNode()`, and a clone re-triggers a load of the copied `src`.
  Against a revoked blob URL there is nothing to fall back to. Revoke on teardown, never on load. Worth a
  `test/browser/` test to pin the behaviour, since this is the sort of thing that works in Chrome and bites
  elsewhere.
- **The decoded bitmap is the memory cost, not the file.** A 1920x1080 background is about 8MB decoded
  whether the file is 400KB or 4MB, and the loaders hold every registered asset decoded for the lifetime of
  the page with no eviction. Fine for the demo's two backgrounds; the ceiling to think about once an author
  imports forty. Independent of the storage backend.
- **Two tabs on one project race the autosave.** Take a `navigator.locks` lock keyed by project id; the second
  tab gets read-only or an "already open in another tab" banner. Cheap now, annoying to retrofit once people
  have data.
- **The project id must be embedded in the exported story, not derived from its OPFS location.** The
  standalone player receives a story from a URL and has no project directory, so a save made from a shared
  link can only be matched if the id travelled with the story. Since the id *is* the directory name this is
  now true by construction, but the export path still has to carry it deliberately. A URL payload arriving
  with no id is invalid and the player bails - there is no fallback key. This is also the fix for the
  hardcoded `loadFromLocalStorage("test")` and the stale-save bug in `ROUGH_EDGES.md`.

- **The player-save key becomes `vn-save-<id>`.** Keep a prefix: localStorage is origin-wide and shared with
  the editor's own keys, so once ids are author-chosen an unprefixed key lets a project named `settings` or
  `theme` collide with whatever the app stores under that name. The prefix is the only thing separating the
  author-controlled keyspace from the app-controlled one, and the two-level shape leaves `vn-editor-*` free.
  The current `vn-<id>` dates to the first localStorage commit in 2021 and had no design behind it; reshaping
  it is free now, when the only key in existence is the demo's `vn-test`, and will not be later.

- **Renaming a project does not touch player saves.** The save key follows the id, so a rename orphans
  `vn-save-<old-id>` - deliberately. Migrating it would be a half-measure: nothing local can reach the saves
  of people playing an already-published build, so the orphaning is unavoidable there regardless. Better to
  make renaming an exported project visibly consequential in the dialog than to paper over the local half.
- **Call `navigator.storage.persist()` on first save**, which exempts the origin from pressure-based
  eviction. Show per-project size from `navigator.storage.estimate()` and a "last exported" date in the
  library, since the project is the unit people actually lose.

## Rejected, and why

- **localStorage for assets.** ~5MB per origin, synchronous, strings only, so binary costs +33% as base64.
  One background can eat half the budget.
- **IndexedDB for everything.** Would work, and buys real transactions and much better DevTools. Loses the
  shared interface with `showDirectoryPicker()`, which is the main reason to prefer OPFS, and turns a
  directory API we would use anyway into a flat map we have to reimplement directories on top of. The case
  for revisiting it is if the linked-folder layer is abandoned outright.
- **Electron or Tauri.** The objection is not bundle size: it forks distribution into two targets, forfeits
  URL sharing, and to avoid looking like malware to a non-developer needs code signing and macOS
  notarization, which costs money annually. That is the actual conflict with "no strings attached".
- **A hosted cloud.** Out of scope by definition. itch.io and GitHub Pages already provide the useful part
  for free.
- **Two-way sync between OPFS and a linked folder.** Conflict detection, external edits, deletes, watching -
  this is where months disappear. One master (OPFS), with the folder as an explicit import/export target
  behind a remembered handle, gets most of the value for a fraction of the work.

## Open questions

- **zip.js's tree-shaken reader size.** Unmeasured, and it decides zip.js against unzipit plus client-zip.
- **`createWritable()` support in current Safari.** Reports conflict. Determines whether the worker plus
  `createSyncAccessHandle()` path is a fallback or the primary implementation.
- **Whether the linked-folder layer ships at all.** It is the main justification for OPFS over IndexedDB, and
  the only thing that pulls IndexedDB into the design.
- **Re-encoding on import.** A 12MP phone photo as a background is the common case and a non-developer will
  not think to resize it. Offer, force, or ignore?
- **Content-addressed assets** (SHA-256 via SubtleCrypto, manifest maps logical name to hash). Gives dedupe
  and change detection cheaply, and is much easier to adopt before there are projects in the wild than after.
  Currently deferred.
- **Whether the rename dialog should warn harder once a project has been exported**, given that published
  saves are orphaned and nothing local can migrate them.
- **Whether editor blur is a good enough rename trigger.** It rides the existing reparse, but it fires on
  incidental focus changes and not at all on a tab close. The startup reconcile makes it safe rather than
  correct.
