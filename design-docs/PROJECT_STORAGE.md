# Project storage

How an author's project is held while they are editing it, and how it leaves the browser.

Status: partly built. The constraint the whole document is shaped by: no cloud, no accounts, no server. A
free, open-source tool with no strings attached cannot have a backend, so everything below happens on the
author's own machine.

**Landed as of 2026-08-30**, each marked inline where it is described: the manifest and its asset
declarations, the id charset rule, the `vn-save-<id>` key, the two-document `?vn=` payload, the demo's
`manifest.yaml` and `script.yaml` as real files, and - as of 2026-08-30 - the whole of tranche 1 of the OPFS
chain: the resolver seam, the primitives, the store, the editor booting and storing through them, and the
one-tab lock. What is left of this document is everything that follows from having a store: the picker, the
rename, import, export and the nag. `.scratch/project-storage/` holds tranche 1's six tickets and that spec
lists what had already landed under them; expect the rest of the details here to move as they get built.

## Two different things are called "saving"

These keep getting conflated and they are unrelated:

- **Player saves.** Where a player is in a story: `[...decisions, remainingAdvances]` plus `seenCommands`, in
  localStorage under `vn-save-<id>`. Tiny, already works, described in the save/load section of `CLAUDE.md`.
  Not what this document is about, except for one consequence in "Load-bearing details" below.
- **Project persistence.** The author's script, assets and metadata. Does not exist yet at all. This is the
  hard one, and it is what follows.

## Prerequisite: assets have to become project data

**Landed 2026-08-28.** A project declares its assets in `manifest.yaml`, validated with Zod, and
`seedState(manifest)` copies them into a starting `VnPlayerState`. What follows described the state before
that: `actors`, `backgrounds` and `audioAssets` lived in `src/demoStory.ts` as a hardcoded state and reached
the parser through a `baseState` parameter that would accept a mid-story one. `.scratch/asset-manifest/` and
`.scratch/asset-ids/`, decided in `docs/adr/0001-manifest-seeds-the-initial-state.md`.

The second prerequisite is an indirection between "logical asset key" and "URL to fetch", and it is **still
open** - TODO item E, ticketed as `.scratch/project-storage/issues/01-asset-resolver.md`. The seven call
sites that concatenated paths are now four calls into `src/domRenderer/assetPaths.ts`, which is the one place
an id becomes a path; what has not moved is where that path is *fetched from*. It still lands in
`img.src = path` / `new Audio(path)` in the two loaders, resolved as a relative URL against the document.
That is convenient: **anything that produces a URL is already a valid backend**, because
`URL.createObjectURL(blob)` drops into `ImageAssetLoaderSrc` and `AudioAssetLoaderSrc` unchanged.

So introduce an `AssetResolver` - logical path in, URL out, async - and consult it in `loadAsset` and nowhere
else. Do this first and the storage choice stops being architectural; it becomes one class.

**It resolves paths, not ids, and the loaders stay keyed by path.** The question "possibly async?" is settled
by where the two live: resolving an id to a file is a manifest question and stays the synchronous function it
is in `assetPaths.ts`, because `SpriteRenderer` and `BackgroundRenderer` do it mid-render. Resolving a file to
bytes is a storage question and is async. The async boundary already exists in the right place -
`loadAssets` preloads everything a state declares before the story runs - so nothing in the render path has
to learn to await.

### The player and the editor get different resolvers

**Landed 2026-08-30.** `AssetResolver` in `src/assetLoaders/AssetResolver.ts`, consulted only by
`AssetLoader.loadAsset` so the render path stays synchronous; `RelativePathResolver` beside it for the player
and every test, and `OpfsAssetResolver` in `src/storage/` for the editor. The logical path stays the loader's
key throughout, which is what makes a missing file report the same way whatever the bytes come from. The base
URL for an outside origin is still unbuilt - nothing has a caller for it - but the class is shaped for it.

Those two implementations are not a transition, they are the steady state, and they line up with the two
entry points that already exist.

**The editor resolves out of OPFS**, because it is editing files and the author's project has to survive.
**The player resolves URLs and does not import**, because a reader following a link wants a first frame, not
a download. Importing everything up front means waiting for every background, sprite pose and audio track
before anything is drawn - minutes for a large novel - and paying that in full for a story most readers
abandon early. It can also fail outright on `QuotaExceededError`, at which point the VN simply will not
open; referencing has no such failure mode because it has no quota interaction. Bringing a hosted VN into
the library stays an explicit action, never a precondition for reading one.

Whether the player should also *cache* what it fetches is deliberately deferred. The browser's HTTP cache
already covers the common case, and the durable alternative is not free: the Cache API is invisible to
`img.src`, so adopting it means either fetching each asset by hand and handing the loaders an object URL, or
introducing a service worker to intercept fetches. That is a real fork, not a switch, and nothing needs it
yet. The rule of thumb when it comes back: OPFS for bytes you own and write back, the Cache API for someone
else's bytes keyed by where they came from.

**Storage is the wrong thing to worry about first for large novels.** The ceiling that actually binds is
decoded bitmap memory - roughly 8MB for a 1080p background whatever the file weighs, held for the lifetime
of the page because the loaders never evict (see "Load-bearing details"). That is identical under every
option here and none of them address it; it needs eviction in the loader. Keep the two problems apart.

## Storage: OPFS

**Landed 2026-08-30** as `src/storage/opfs.ts`: writes, a recursive walk yielding sizes, recursive delete,
directory listing, and `isSupported()`. Three deviations from what is written below, all deliberate.
The dedicated-worker plus `createSyncAccessHandle()` path is **not** built - it is a second implementation of
the write half justified by reports rather than a measurement, it would land untested against the browser it
exists for, and it cannot even be feature-detected from the main thread, where `createSyncAccessHandle` is
undefined. A browser that fails `isSupported()` gets **no editor at all** rather than a degraded one; see
`.scratch/project-storage/issues/03-opfs-primitives.md`. And the tmp-then-`move()` write this document
prescribed was dropped the same day it shipped, because `createWritable` is already atomic - the correction
is in "Load-bearing details", and it is the one place where reading the spec reversed a decision this
document had called not optional. No Safari was available to measure, so the open question about it below
stays open.

The working copy lives in the Origin Private File System, reached through
`navigator.storage.getDirectory()`.

**Durability is not what picks the backend.** OPFS, IndexedDB, the Cache API and localStorage share one origin
quota, one eviction policy, and all die together on "Clear site data". Safari additionally deletes
script-created storage after seven days without user interaction with the origin. Whatever we pick, browser
storage is a good working copy and a bad only copy - which is why the export path in "Leaving the browser" is
a safety net rather than a nicety.

What OPFS wins on:

- **The same interface as a real folder.** `showDirectoryPicker()` and `navigator.storage.getDirectory()` both
  return a `FileSystemDirectoryHandle`, so the "link this project to a folder on disk" layer is a handle swap
  rather than a second implementation. This is the strongest argument, and stronger than it first looks:
  that picker is the *only* way to write a directory tree out of a browser at all (see "Leaving the browser"),
  so the linked-folder layer is not a convenience feature, it is the folder export.
- **The path model is already ours.** `sprites/A1/idle.png` is what `DomRenderer` builds today, what the
  export zip contains, and what a linked folder would hold. With a key-value store we would reimplement
  directory semantics on top of a flat map.
- **Streaming writes.** An import can pipe an archive entry to disk without materializing it in memory.

What it costs:

- **No cross-file atomicity.** IndexedDB has transactions; OPFS has per-file writes. **Corrected
  2026-08-30**: this section used to prescribe writing `x.tmp` then `FileSystemFileHandle.move()` and
  called it not optional. Per-*file* writes turn out to be atomic already - see "Load-bearing details" -
  so what is actually missing is only the *cross-file* half, which nothing in the store needs yet:
  `manifest.yaml` and `script.yaml` are written independently and a torn pair is not a state either
  reader can detect. If a change ever has to span both, this is the cost to design around.
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

**Landed 2026-08-30**, exactly as below, in `src/storage/projectStore.ts` - and `src/domRenderer/assetPaths.ts`
moved to build `assets/`-prefixed paths ahead of it, so a project directory, a published folder and an export
archive are the same shape.

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

**The `assets/` level is kept, and the code moves to match it** - confirmed 2026-08-29, when building the
store forced the question. It is worth writing down why, because the code currently disagrees and the
argument three paragraphs above looks like it settles the matter the other way.

`src/domRenderer/assetPaths.ts` builds `backgrounds/a.png` and `sprites/A1/idle.png` with no prefix, and
`test-assets/` is laid out to match. So "the path model is already ours" is true - but it is a claim about
the *shape*, that a project holds a directory tree with actor-scoped sprite folders rather than a flat
key-value map, and a shared parent does not touch that. All three consumers still agree with each other,
because all three carry the same prefix: the OPFS directory, the published folder and the zip are still the
same tree.

What the wrapper buys is room at the project's top level. A project directory is not going to hold only these
five things: export writes a `README.txt` there, `design-docs/SCRIPT_INCLUDES.md` puts N script files in a
project, and per-project editor state is a plausible fourth. Without the wrapper each of those lands in the
same namespace as `backgrounds/` and `sprites/`, and "which top-level entries are assets" becomes a rule
someone has to know. With it, everything above `assets/` is the project describing itself and everything
below is media.

The cost is a one-time move, and it is the whole cost: the three prefixes are written once in
`assetPaths.ts`, so nothing in `src/` outside that file has to change. See
`.scratch/project-storage/issues/01-asset-resolver.md`, which does it as its first step.

`editor.yaml` sits beside `projects/`, not inside a project. It holds the editor's own bookkeeping - last
opened, last exported, a rename in flight - none of which is project data and none of which should travel in
an export. Keeping it outside the project directories is what lets a `.webvn.zip` stay *exactly the contents
of one project directory*: export is a straight walk, import a straight copy, with nothing to filter out.
It belongs in OPFS rather than localStorage for the same reason the manifest does - it is evicted atomically
with the data it describes instead of drifting out of sync with it.

`manifest.yaml` is a separate file from `script.yaml`, and YAML rather than JSON so it uses the parser and the
dependency already in the tree, and so a human can read it in the export. It holds project identity plus the
asset declarations that currently live in `demoStory.ts`:

```yaml
formatVersion: 1
id: my-story        # author-chosen, restricted charset, names the directory
title: My Story
actors:
  A1:
    name: Actor
    nameTagColor: purple
    sprites:
      idle: idle.png
      angry: "2.png"
backgrounds:
  street: a.png
  room: b.png
audioAssets:
  theme:
    file: bgm/map01.ogg
    title: Theme
    artist: Someone
```

**Landed 2026-08-28**, validated with Zod in `src/yamlParser/parseManifest.ts` as this section proposed. The
example above has been corrected to the shipped shape: the three declarations are **keyed maps of id to
file**, not lists, so the script names an id and the manifest says which file it is. That makes the manifest a
symbol table rather than a preload index - a file can be renamed without touching the story, and an audio
asset has somewhere to carry its title. `.scratch/asset-ids/`. `formatVersion: 1` is required and checked
before the rest of the schema, precisely because a v0 manifest's lists would otherwise produce a shape error
per declaration and bury the one message that explains them all.

**The id is author-chosen, not a UUID, and it names the directory.** An earlier draft used a UUID
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

**Landed 2026-08-28**, as `ID_PATTERN` and `WINDOWS_RESERVED` in `src/yamlParser/parseManifest.ts`, ahead of
anything that stores a directory. The store validates an id by reusing that schema rather than restating the
rule: it has to hold for the OPFS directory name, the export filename and the localStorage key suffix at
once, and a second copy is a copy that drifts.

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

The deciding argument is that single-project makes import destructive: "open a `.webvn.zip`" would mean
"destroy whatever you were working on", guarded by a confirm dialog whose real question is "did you remember
to export?". With a library, import is additive and boring.

This also matches what comparable tools do. Browser tools that can reach real files (vscode.dev, Photopea,
draw.io) are document-centric and let the filesystem be the library. Tools whose users cannot be assumed to
manage files and which refuse to require an account (Twine, Scratch, Construct 3, the Godot web editor) own a
project list in browser storage. Twine is the near-exact precedent - hypertext authoring, non-developer
writers, no account - and it is also the cautionary tale: its most common support thread for a decade has been
someone losing their whole library to cleared browser data. Hence the export nagging below.

**Sequencing: build the layout for many, ship the UI for one.** `projects/<project-id>/...` from the first commit
costs nothing and removes the migration entirely; the picker can arrive whenever it is convenient. **The layout
half landed 2026-08-30**: `listProjects` walks `projects/` and there is no index file, `editor.yaml` records
`lastOpened`, and the boot is already "`lastOpened`, else the first listed". The picker itself is unbuilt, and
until it exists the editor opens what `editor.yaml` names and nothing else.

**The runtime stays strictly single.** `VnPlayer`, `DomRenderer` and the resolver never learn that other
projects exist. Switching projects is a full teardown and remount through the same path as initial boot, never
a live swap. `DomRenderer.render` already carries a generation guard for overlapping renders (see the renderer
contract in `CLAUDE.md`); a project swap mid-render would be a new class of the same bug, and there is no
reason to invite it.

## Getting a project in

Four ways a project reaches the library: the file picker, drag and drop, "load the demo", and importing a
published VN from a URL. They share their whole back half - validate the manifest, write the tree into OPFS,
raise the collision dialog if the id is taken - and differ only in where the bytes come from.

**That difference is a `SourceLoader`, which the design already has.**
[SCRIPT_INCLUDES.md](./SCRIPT_INCLUDES.md) defines `load(path): Promise<string>` with implementations for
the editor's OPFS, for zip entries, and for an in-memory map in tests. An HTTP base URL is a fourth. Import
is written against that interface and against nothing else, so a new ingestion path costs a loader rather
than a subsystem. Resist the version that takes a `File`: two of the four sources never produce one.

### Importing from a URL

A published VN is a static folder - `manifest.yaml`, `script.yaml`, `assets/...` served over HTTP. Importing
one is the publish format read backwards, which is the real argument for it: anything anyone published is
importable and editable by anyone else, with no archive needing to exist and no author needing to have kept
one.

**The manifest is the index.** HTTP offers no directory listing, so nothing else can say what a hosted
project contains - but `actors[].sprites`, `backgrounds` and `audioAssets` already enumerate every asset.
Fetch `<base>/manifest.yaml`, parse it, then fetch `script.yaml` and exactly the assets it declares. This
promotes the manifest from "what assets exist" to "what files constitute this project", and the corollary is
binding: **a file the manifest does not declare cannot be imported.** That already matches the engine, which
will not load an undeclared asset either, but it is now load-bearing in a second place.

**A partial import is a failure, not a project.** Unlike an archive, which either parses or does not, a
folder import can half-succeed - thirty-seven assets fetched and three returning 404. Fail the whole import
and name the missing files. Landing a project with silent holes in it is the same state the rename recovery
exists to prevent, and it would be perverse to let import create it deliberately.

**Copy into OPFS; do not reference.** `AssetResolver` makes the alternative cheap - keep the manifest and
script, leave the assets remote behind a base-URL resolver - and it is instant and free of copying. It also
makes the author's project depend on someone else's server staying up, which is the premise this whole
document rejects. The URL is a source, never a live link.

This is about *importing*, and does not contradict the player resolving URLs directly ("The player and the
editor get different resolvers" above) or a shared link pointing its assets at `&assets=<url>` below.
Reading someone's hosted VN over the network is exactly right; a project sitting in your own library that
silently stops working when their host goes down is not. The distinction is ownership, not mechanism.

CORS decides the reach: every fetch is cross-origin, so a host that does not send `Access-Control-Allow-Origin`
cannot be imported from at all. One header covers a whole project, since the requirement is the same for each
file.

### The demo is the first published VN

The library needs a first-run story - an empty picker is the worst possible introduction to an authoring
tool - and "load the demo" is it.

Build it as a URL import of a demo laid out in `dist/` as a published project, not as a special case that
writes files directly. Almost all of it is already there: `CopyPlugin` copies `test-assets/` into `dist/`
verbatim, so the sprites, backgrounds and audio are already deployed at the paths `DomRenderer` builds.

**The file half landed 2026-08-28/29, exactly as prescribed here.** `test-assets/manifest.yaml` and
`test-assets/script.yaml` are real files, imported back into `src/demoStory.ts` as strings with `?raw` - vite
supports it natively and webpack 5 matches it with a `resourceQuery: /raw/` rule of `type: "asset/source"` -
so the YAML files are the single source and `test/demo/DemoStory.test.ts` was untouched. `dist/` is therefore
already a published project directory. What is left of this section is the URL import that reads it back, and
the button that calls it.

Until that exists, an empty library has nothing to show, so
`.scratch/project-storage/issues/05-editor-boots-from-the-store.md` seeds the demo into the store directly
from those same `?raw` constants - scaffolding, with its deletion condition named in the ticket: when URL
import lands, the seed becomes a call to it and the demo stops being a special case.

Three things fall out of doing it this way rather than special-casing:

- The demo dogfoods the publish format from the first commit instead of the doc describing it hypothetically.
- The button exercises the real import path every time anyone presses it, which is continuous coverage of
  the most fragile machinery here from the feature most likely to be used.
- Being same-origin, it isolates the variables: whether the loader works gets settled before whether an
  arbitrary host cooperates.

Pressing it twice is just the id collision dialog, so "reset the demo to pristine" arrives for free. That
does sharpen the collision policy though: "I tinkered with the demo and want a clean one *too*" is the
natural case, and overwrite-or-cancel forces losing one of them. It is the strongest argument for offering
rename-on-import.

### Sequencing, and the one hard constraint

URL import lands before zip import. It needs no build machinery, the demo is already hosted, and same-origin
keeps CORS out of the first attempt.

**Zip export and import land before the linked-folder layer.** The archive works in every browser and the
folder export works only on Chromium, so the archive is what makes the durability claim true for everyone;
shipping the Chromium-only path first would leave most users with no way out of the browser at all. This
sequences the layer later without weakening the case for it - being the folder export rather than a
convenience makes it *more* likely to ship, which is worth noting because the OPFS-over-IndexedDB argument
rests on it.

**But zip import must not lag behind export.** This document calls the archive the canonical artifact and
the answer to eviction - browser storage being a good working copy and a bad only copy. An export that
nothing can read back is not a safety net, it is a file that looks like one. Defer zip import freely; do not
ship the export button ahead of it. If anything that argues for building export and zip import as a single
unit, rather than letting export be the tempting easy half.

**Every import needs a size and entry-count cap**, from the first one. An archive or a hosted folder is
content the author did not make. The script is data rather than code, so there is nothing to execute, but a
zip bomb or an archive of a hundred thousand entries can exhaust the origin's quota or hang the import. The
cap belongs in the shared back half, where it covers all four paths at once, and is awkward to retrofit.

## Leaving the browser

**The canonical artifact is a `<project-id>.webvn.zip` file on the author's disk. The OPFS library holds
working copies.** That framing is what makes eviction survivable, makes a "last exported N days ago" nag
principled rather than paranoid, and gives the linked-folder layer a natural place to live.

The format is a zip, not gzip. Media is already compressed, so gzipping the bundle buys close to nothing while
making it opaque; a zip is inspectable, and store-mode entries for media keep import a straight copy. It is
the contents of `projects/<project-id>/`, manifest included, unwrapped at the archive root.

**The extension really is `.zip`, not a custom `.webvnproj`.** Every precedent points the other way - `.sb3`,
`.love`, `.epub`, `.docx`, `.kra` are all zips wearing a custom extension - but every one of those belongs to
an application that *installs* and registers a file-type handler. This project has ruled that out (see
"Rejected" below), so nothing on the author's machine would ever claim `.webvnproj`, and the extension's only
achievement would be a double-click that says "no app associated with this file". Ending in `.zip` means any
OS opens it with the built-in archive tool, and the author can look inside without owning any tooling at all -
which for a format whose selling point is being inspectable is most of the point.

A pleasant accident: Windows hides known extensions by default, so the file *displays* as `my-story.webvn`
while still double-clicking as a zip - the identity of a custom extension without the dead end.

What it costs is the PWA route. An installed PWA can register `file_handlers` in its manifest and receive
double-clicked files through `launchQueue`, and that can name a custom extension but obviously cannot claim
`.zip`. So a future "double-click a project, it opens in the editor" is foreclosed for anyone who installs
WebVN as a PWA - Chromium desktop only, and only once installed. That is a narrow enough slice to trade for
every non-developer being able to open the file today.

**Import sniffs the magic bytes (`PK\x03\x04`), never the extension.** Renaming a project file must not make
it unopenable, drag-and-drop carries no reliable extension anyway, and sniffing means both spellings are
accepted regardless of which one export writes. The decision above is therefore reversible: it only picks the
default filename export suggests.

**`manifest.yaml` sits at the archive root; there is no wrapping `<project-id>/` directory.** Best practice
says wrap, to stop a hand-extraction scattering files into the author's Downloads folder. That risk is
smaller than it looks: Windows Explorer's "Extract All" always wraps in a folder named after the archive, and
what actually scatters is `unzip` at a terminal - the one audience equipped to pass `-d`. Set against it,
wrapping would put the project id in three places at once (the filename, the root directory name, and the
manifest) with no guarantee they agree, and would demand a precedence rule for when they do not. Not wrapping
deletes that question.

The accepted costs are that `unzip` scatters, and that a GUI extraction yields a folder named after the
archive, inheriting the double extension - `my-story.webvn/` rather than a clean `my-story/`.

**Import normalizes the shape rather than requiring one.** If every entry shares a single top-level directory
prefix and there is no `manifest.yaml` at the archive root, strip that prefix. The rule is unambiguous
because a manifest at the root is mandatory, so the two layouts can never be confused for one another. This
matters more than the layout does: the natural way to re-zip an edited project - macOS right-click Compress,
Windows "Send to compressed folder" - operates on the *folder* and so produces a wrapped archive. A format
meant to be opened by hand has to accept whatever a hand puts back, including archives assembled by
third-party tools that wrap differently. The choice above is then only about what export writes.

**The manifest `id` is the source of truth for identity, everywhere, without exception.** Not the archive
filename, not the wrapping directory a normalized import just stripped, not the OPFS directory name. Those
are labels *derived* from the id and are allowed to be stale; the manifest is the project saying what it is.
So importing `whatever-they-renamed-it.zip` yields the project its manifest names, and when an OPFS directory
disagrees with the manifest inside it the fix is **always to rename the directory to match the manifest,
never to rewrite the manifest to match the directory** - which is exactly the rename in "Renaming" above,
reached from the other direction. That direction is worth stating because the cheap implementation is the
wrong one: rewriting the field is a one-line write and copying a directory is not, so an optimization later
could silently rename the author's project instead of moving it.

This does not contradict "Enumeration is the truth" above; the two answer different questions. Enumeration is
authoritative about *which projects exist* - a directory listing cannot lie about that. The manifest is
authoritative about *what a project is*. A directory with no manifest is therefore not a project with a
missing name, it is not a project.

**Extracting the archive does not hand you something the editor is watching.** Making the format inspectable
invites someone to edit the files they extracted and expect it to take effect. Today nothing watches any
folder: OPFS is the master, and an extracted tree gets back in only by being imported. That is a property of
the current design rather than of the format - if the linked-folder layer ships it stops holding for a
*linked* folder, and the open question below owns revisiting it.

A short `README.txt` at the archive root is cheap, and lands beside `manifest.yaml` where it is the first
thing visible when the zip is opened in an OS viewer. It is generated on export and skipped on import, the
one place where the archive is not exactly the project tree.

**Its wording has to outlive the design.** The README ships inside every archive an author has already
exported, so unlike this document it cannot be corrected later - which rules out describing architecture in
it. Keep it to what the file is, what wrote it, and the URL to open it at, phrased as an instruction ("to
work on this, open <url> and import this folder") rather than a prohibition ("editing these files does
nothing"). The instruction stays true if linking arrives; the prohibition would not.

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

**A published folder normally holds the player too**, not just the project: `player.html` and its bundle
sitting beside `manifest.yaml`, `script.yaml` and `assets/`. That is what `dist/` already is, and it is why
the demo's two documents sit at the dist root rather than in a subdirectory - a reading that makes the layout
deliberate rather than accidental. Import needs no rule for the extra files: it reads `manifest.yaml` and
fetches exactly what the manifest declares, so `player.html` and the bundle are skipped by the same rule that
skips everything else undeclared.

**Whether the player can also load a VN hosted somewhere else is open**, and deliberately not decided here.
The mechanism would be a base URL on the relative resolver - a few lines - but the substance is CORS and what
a partial failure looks like, which is the same territory as URL import and should be decided where it is
testable. Nothing in the storage tickets depends on the answer; `.scratch/project-storage/issues/01-asset-resolver.md`
only asks that `RelativePathResolver` stay shaped so a base can be added to it later.

**"A static folder" is not a uniform feature.** There is no portable way to write a directory tree out of a
browser. `showDirectoryPicker()` does it properly - point it at a git working copy or a folder synced to
Netlify or itch, and the export is the same directory walk with a different root handle - but it is Chromium
only. The alternatives are not merely worse, they cannot work: bulk downloads are throttled and prompted,
and the `download` attribute sanitizes path separators so a page cannot write outside Downloads, which
flattens any structure into loose files. Drag-out via `DataTransfer`'s `DownloadURL` is Chromium-only and
one file at a time.

So on Chromium, publishing to a folder writes the tree where the author points it; everywhere else it
degrades to "download the archive and extract it yourself". **This is the real reason the archive is the
canonical artifact** - not a preference for a single file, but the only mechanism the platform offers in
every browser.

**Consequence of splitting the manifest out:** `?vn=<gzipped script>` no longer describes a complete story,
since the asset and actor declarations are in `manifest.yaml`. **Landed 2026-08-29** as prescribed - the URL
payload is a two-document YAML stream, manifest, `---`, script, parsed with the `yaml` dependency's
`parseAllDocuments`, and it stays small under gzip. A single-document payload is refused rather than read
against a default manifest; `docs/adr/0003-the-url-payload-carries-the-manifest.md` says why, and says it
because the next reader will want to accept one for backwards compatibility. Assets themselves can never
travel in a URL, so a shared link with custom assets also needs a base URL for them, e.g. `&assets=<url>`. That is worth having
anyway: it makes reusable asset packs possible.

**Note what this competes with.** Once a published VN can be opened by URL ("Importing from a URL" above), a
link to the published folder carries manifest, script and assets as one coherent thing, and does it better
than a payload plus an asset base. The URL payload keeps a narrower job: a small script over assets that
already exist somewhere - a quick share, a bug repro, a variation on a published VN. It is not the general
sharing mechanism, and should not grow into one.

## Load-bearing details

Things that will break quietly if they are skipped.

- **An OPFS write is already atomic; do not add a scheme on top. Corrected 2026-08-30**, after the
  spec was actually read. This bullet used to say every write must go `x.tmp` then `move()`, on the
  grounds that a crash mid-write to `script.yaml` truncates the author's work. That is not what
  happens. The File System Standard is normative that "any changes made through stream won't be
  reflected in the file entry locatable by fileHandle's locator until the stream has been closed", so
  the old contents stand until `close()` and there is no short window. The swap file is how that is
  typically implemented and is explicitly non-normative - Chromium writes `<name>.crswap` beside the
  target, which enumeration never sees.
  The tmp-then-move that shipped in `src/storage/opfs.ts` was therefore dropped the same day. Two
  reasons beyond redundancy: the tmp file was *itself* written with `createWritable`, so it hedged
  that primitive with itself and hedged nothing; and it added a failure mode, since a crash between
  `close()` and `move()` leaves a stray `<name>.tmp` that the walk, the listing and an export would
  each treat as the author's.
  What is genuinely uncovered is an engine that ignores the visibility rule and writes in place -
  "try to ensure that no partial writes happen" is the spec's phrasing, and "try" is not "must". That
  is a ticket with a reproduction attached, not a guess, and its answer would be a tmp file written
  through whatever primitive that engine does get right. `move()` is a Chromium addition and is not
  in the spec at all, which is the other half of why it is gone.
  **Per-path write serialization stays**, and is a different thing: it is what makes the *last queued*
  write win, which is what a debounced store wants.
- **Object URLs must survive until story teardown.** `ImageAssetLoaderSrc.getAsset` and
  `AudioAssetLoaderSrc.getAsset` return `cloneNode()`, and a clone re-triggers a load of the copied `src`.
  Against a revoked blob URL there is nothing to fall back to. Revoke on teardown, never on load. Worth a
  `test/browser/` test to pin the behaviour, since this is the sort of thing that works in Chrome and bites
  elsewhere. **Landed 2026-08-30** as `test/browser/objectUrlLifetime.test.ts`, written before anything minted
  such a URL. `OpfsAssetResolver` therefore never revokes, and `AssetResolver` has no `release` method: there
  is no teardown yet, and when eviction needs one it belongs to the loader, which holds the element and knows
  when it drops one. A clone of a loaded image is ready synchronously whether its URL is
  `blob:` or relative - measured, after the opposite was briefly written down here.
- **The decoded bitmap is the memory cost, not the file.** A 1920x1080 background is about 8MB decoded
  whether the file is 400KB or 4MB, and the loaders hold every registered asset decoded for the lifetime of
  the page with no eviction. Fine for the demo's two backgrounds; the ceiling to think about once an author
  imports forty. Independent of the storage backend.
- **Two tabs on one project race the editor's storing.** Take a `navigator.locks` lock keyed by the project
  *directory* - which is what writes address - and the second tab gets an "already open in another tab"
  refusal rather than an editor. **Landed 2026-08-30** in `src/storage/projectLock.ts`, `ifAvailable` so a
  refused tab fails fast rather than looking hung, and taken before the boot writes anything. Deliberately in
  the same tranche as storing itself: before storing exists a second tab costs nothing, and
  after it there is exactly one copy of the author's work and two debounced writers, so the two must ship
  together. Read-only for the second tab was considered and dropped - a mounted editor whose writes are
  suppressed is the memory-only path the editor otherwise refuses to have, reached from another direction.
- **The project id must be embedded in the exported story, not derived from its OPFS location.** The
  standalone player receives a story from a URL and has no project directory, so a save made from a shared
  link can only be matched if the id travelled with the story. Since the id *is* the directory name this is
  now true by construction, but the export path still has to carry it deliberately. A URL payload arriving
  with no id is invalid and the player bails - there is no fallback key. **Landed 2026-08-29**: `seedState`
  copies `id` onto `VnPlayerState`, so a reload carries its own save key and no caller can swap the story
  without swapping the key. The hardcoded `loadFromLocalStorage("test")` is gone with it. The *stale-save*
  bug in `ROUGH_EDGES.md` is not fixed and was never this: the id names the project, not the version of its
  script, so a save made before an edit still loads afterwards.

- **The player-save key becomes `vn-save-<id>`. Landed 2026-08-29.** Keep a prefix: localStorage is
  origin-wide and shared with the editor's own keys, so once ids are author-chosen an unprefixed key lets a
  project named `settings` or `theme` collide with whatever the app stores under that name. The prefix is the
  only thing separating the author-controlled keyspace from the app-controlled one, and the two-level shape
  leaves `vn-editor-*` free. The `vn-<id>` it replaced dated to the first localStorage commit in 2021 and had
  no design behind it; reshaping it was free while the only key in existence was the demo's `vn-test`, and
  would not have been later.

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
  for revisiting it is if the linked-folder layer is abandoned outright - which got less likely once that
  layer turned out to be the only way to write a folder out of a browser, rather than a nicety.
- **Electron or Tauri.** The objection is not bundle size: it forks distribution into two targets, forfeits
  URL sharing, and to avoid looking like malware to a non-developer needs code signing and macOS
  notarization, which costs money annually. That is the actual conflict with "no strings attached".
- **A hosted cloud.** Out of scope by definition. itch.io and GitHub Pages already provide the useful part
  for free.
- **Two-way sync between OPFS and a linked folder.** Conflict detection, external edits, deletes, watching -
  this is where months disappear. One master (OPFS), with the folder as an explicit import/export target
  behind a remembered handle, gets most of the value for a fraction of the work.

## Open questions

Two that were open here are now settled and have moved into the sections they belong to: whether asset
resolution is async (it is, and it resolves paths rather than ids), and whether a project directory has an
`assets/` level (it does not).

- **zip.js's tree-shaken reader size.** Unmeasured, and it decides zip.js against unzipit plus client-zip.
- **`createWritable()` support in current Safari.** Reports conflict. Determines whether the worker plus
  `createSyncAccessHandle()` path is a fallback or the primary implementation. Until someone measures it,
  `.scratch/project-storage/issues/03-opfs-primitives.md` feature-detects and refuses rather than building a
  second write implementation against a browser nobody has tested - a worker path is a ticket with a
  reproduction attached, not a precaution.
- **When the linked-folder layer ships, not whether.** It is the main justification for OPFS over IndexedDB,
  the only thing that pulls IndexedDB into the design, and - since `showDirectoryPicker()` is the only way to
  write a directory tree out of a browser - the folder export itself. It lands after zip export and import,
  which cover every browser rather than only Chromium. It would also make a folder on disk a live target
  rather than an inert copy, which is why the export README must not claim otherwise.
- **Which hosts URL import can actually reach.** Every fetch is cross-origin, so a host that does not send
  `Access-Control-Allow-Origin` cannot be imported from at all. GitHub Pages is believed fine; itch.io and
  Neocities are unverified. This does not change the design but it decides how the feature is described, and
  whether "import from URL" needs to say "from a host that allows it".
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
