# The AssetResolver seam

Status: done (2026-08-30)

TODO item E, and the gate on the whole storage chain. `design-docs/PROJECT_STORAGE.md`, "Prerequisite:
assets have to become project data". A refactor with no behaviour change: what it buys is that
"where do an author's asset bytes come from" becomes one class rather than an assumption spread
through the render path.

## Where the seam goes

A path plays two roles in the loaders today, and the whole ticket is separating them.

**As a key.** `DomRenderer.loadAssets` (`src/domRenderer/DomRenderer.ts:422`) walks
`declaredAssets(state)` and registers each path with the image or audio loader; the three render-time
call sites resolve an id back to the same path and ask the loader for what is under it -
`SpriteRenderer.resolve` (`:160`), `BackgroundRenderer.makeRenderable` (`:129`),
`AudioRenderer.pathOf` (`:105`).

**As a URL.** `ImageAssetLoaderSrc.loadAsset` assigns it to `img.src`; `AudioAssetLoaderSrc.loadAsset`
passes it to `new Audio(...)`. Both then resolve as relative URLs against the document, which is why
a deployed build works at all.

Keep the first role and replace the second:

```ts
// src/assetLoaders/AssetResolver.ts
export interface AssetResolver {
  // A path inside the project - `assets/backgrounds/a.png`, `assets/sprites/A1/idle.png` - to
  // something an element can load. Async because reading a file out of OPFS is.
  resolve(path: string): Promise<string>
}
```

**The logical path stays the key everywhere.** `registerAsset`, `getAsset`, `loadAll`,
`DeclaredAsset.path` and every failure report are untouched, and only `loadAsset` consults the
resolver. That is the whole design decision, and it is worth being explicit about why, because the
tempting reading of "AssetResolver" is that it replaces `src/domRenderer/assetPaths.ts` outright.

## Why the seam is not deeper

The three render-time call sites above are synchronous, and two of them are synchronous for
structural reasons rather than by accident: `BackgroundRenderer.makeRenderable` builds a `Renderable`
that a `requestAnimationFrame` loop draws, and `SpriteRenderer.createSpriteElem` is called from inside
the sprite diff that decides which elements to build, keep and fade. Making id-to-URL resolution async
pushes `await` into both, and from there into `DomRenderer.render`, which the generation guard and
every sub-renderer's `animate: false` contract are built around.

There is no need. **The async boundary already exists, in the right place**: `loadAssets` preloads
every declared asset before a story runs, so by the time anything renders, the bytes are in the
loader and the URL has done its job. Resolution at render time is a synchronous map lookup and must
stay one.

## Why not resolve ahead, in `loadAssets`

The obvious alternative is to leave the loaders ignorant of storage entirely: `loadAssets` resolves
every declared path up front and calls `registerAsset(logicalPath, url)`. It is a cleaner-looking
boundary, and it would put revocation under one owner later.

It costs a re-read of the whole project on every keystroke pause. **Registration is cumulative and
re-runs on every adopt-on-blur**, and `loadAsset` early-returns for anything already loaded *before*
it would resolve - so consulting the resolver there means only genuinely new assets are resolved.
Resolving ahead means N OPFS reads and N fresh object URLs every time the manifest is adopted,
unless `loadAssets` starts tracking what is already loaded, which is duplicating the loader's own
state in its caller.

That is the argument. "Less invasive" is true but is not the reason.

So `assetPaths.ts` keeps both halves and keeps its name. It answers "which file is this id", which is
a manifest question and stays a pure function of the declarations. The resolver answers "where do
this file's bytes come from", which is a storage question. Two questions, two modules.

## The pieces

1. **`src/assetLoaders/AssetResolver.ts`** - the interface above, plus
   `RelativePathResolver`, whose `resolve` is `Promise.resolve(path)`. Not a placeholder: it is what
   the standalone player, the deployed demo and every test use permanently, because a published VN
   *is* a directory of relative paths. `design-docs/PROJECT_STORAGE.md`'s "The player and the editor
   get different resolvers" is the reasoning, and it is the steady state rather than a migration.

   **Its anticipated second caller is a player loading a VN from another origin**, which needs a base
   URL rather than resolving against the document. That is deliberately not built here - nothing in
   tranche 1 has a caller for it, and the interesting half of outside-origin is CORS and partial
   failure, not the base. Keep the class shaped so a base can be a constructor argument later: do not
   collapse it into a bare function or a singleton.
2. **`AssetLoader<T>` gains a resolver.** Both implementations take one in their constructor and
   default to `RelativePathResolver`, so the eight construction sites - two in `DomRenderer`, six in
   `test/browser/assetLoaders.test.ts` - are unchanged. `loadAsset` becomes
   `const url = await this.resolver.resolve(path)` and then exactly what it does now with `url` in
   place of `path`.
3. **`DomRenderer` takes an optional resolver** and passes it to both loaders it constructs
   (`:120-121`). A fourth constructor argument on a constructor that already has three is worth
   avoiding - prefer an options object for the two optional ones, or a setter called before
   `loadAssets` ever runs. Implementer's call; say which in the commit message.
4. **Nothing else changes.** Both entry points keep the default. `loadAll`'s reported-not-retried
   behaviour is unaffected: a resolver that rejects (the file is not in the store) fails that path's
   load like any other, which is how "a declared file that is not there" keeps working for OPFS for
   free.

## Step zero: move the assets under `assets/`

`design-docs/PROJECT_STORAGE.md`'s layout has an `assets/` level and the code does not:
`assetPaths.ts` builds `backgrounds/a.png` and `sprites/A1/idle.png`, and `test-assets/` is laid out
flat to match. **The doc wins** - see its Layout section for why, decided 2026-08-29. The code moves.

Do it first, as its own commit. It is a rename with no behaviour change, it is unrelated to the
resolver, and doing it after would mean writing the resolver's tests against paths that are about to
change.

**The prefix goes in `assetPaths.ts`'s three `xFilePath` functions and nowhere else.** That is what
"the directory prefix is written once" in its header comment is for. The resolver is deliberately not
where it goes: a prefix is part of the project's layout, not part of where bytes come from, and a
resolver that added one would make the two implementations disagree about what a path means.

The whole change:

- `src/domRenderer/assetPaths.ts:17,24,32` - the three prefixes become `assets/audio/`,
  `assets/backgrounds/`, `assets/sprites/<actor>/`.
- `git mv test-assets/{audio,backgrounds,sprites} test-assets/assets/`. CopyPlugin copies
  `test-assets/` to the dist root verbatim, so the published demo follows with no config change.
- `test/browser/assetLoaders.test.ts:11-13` - three literal `/test-assets/...` paths.
- `test/demo/DemoStory.test.ts:220` builds `` `backgrounds/${...}` `` by hand, which is the drift the
  header comment warns about - it is two lines below a correct `spriteFilePath` call. Fix it by
  calling `backgroundFilePath`, not by editing the string. Line 226's `"/test-assets/" + path` then
  needs nothing, because the prefix arrives inside `path`.
- `src/demoStory.ts:8` - a comment naming the three directories as siblings of the two YAML files.

Nothing else in `src/` refers to those directories, which is the point of the seam that already
exists there.

## Tests

`test/browser/` - the loaders need a real document.

- **The indirection is real.** Load an image through `ImageAssetLoaderSrc` with a resolver that maps a
  logical path to a data URL, and assert `getAsset(logicalPath)` returns a loaded element. This is
  the test that fails if someone later inlines the path back into `img.src`, and it is the only
  reason to write tests for a no-op refactor at all.
- **The key is the logical path, not the URL.** With the same resolver, assert `getAsset` is looked up
  by the path that was registered - a resolver whose output differs from its input must not change
  what the caller asks for.
- **A rejecting resolver is a failed load.** `loadAll` reports that path in its return value and does
  not reject, matching what a missing file does today.
- The existing browser and demo suites are the rest of the coverage: with the default resolver, every
  one of them must pass untouched. Run `npm run test:demo` as well as the fast gate - the render path
  is what this touches.

## Not in scope

- **The OPFS implementation.** It needs a project directory to resolve against, which is ticket 04.
  Ticket 05 adds it.
- **Revocation and eviction.** `resolve` has no `release` counterpart on purpose. The loaders never
  evict, so an object URL minted here lives as long as the page, which is correct and is what ticket
  02 pins; the doc's "revoke on teardown, never on load" needs a teardown to exist first, and none
  does. Adding a release hook now would be adding a lifecycle with no caller.

  **Say on the interface who would own revocation when eviction does arrive: the loader, not the
  resolver.** The loader holds the element and knows when it drops one; the resolver hands back a URL
  and forgets it. Without that line the instinct is to give the thing that minted the URL the job of
  revoking it, and a resolver that revokes breaks every `cloneNode` the loaders hand out - which is
  exactly the failure ticket 02 exists to pin.
- **Caching what the player fetches.** Explicitly deferred by the doc, and it is a fork (Cache API
  plus hand-fetching, or a service worker) rather than a resolver implementation.
- **The decoded-bitmap ceiling.** Independent of this and of the backend; it needs eviction in the
  loader.
