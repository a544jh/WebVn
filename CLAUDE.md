# CLAUDE.md

Notes for Claude Code (and other agents) working in this repo. Derived from a repo-wide review; keep in sync when the architecture shifts.

## What this is
A client-side visual novel engine + authoring tool. TypeScript, webpack. The "real" renderer uses direct DOM + Canvas2D APIs (no UI framework). Script language is YAML, parsed by the `yaml` lib. Commands self-register via side-effect imports.

Two entry points:
- `src/index.ts` → editor + live-preview player. Boots a project out of OPFS through `src/editorBoot.ts`;
  a browser without OPFS, or a second tab on the same project, gets a refusal and no editor.
- `src/playerIndex.ts` → standalone player, can load a script from `?vn=<base64 gzip YAML>`. Never touches
  OPFS, so it works in any browser.

## Commands
- `npm install` — install
- `npm run dev` — webpack-dev-server
- `npm run build` — production build
- `npm run typecheck` — `tsc --noEmit`. Vitest transpiles via esbuild and does **not** typecheck, so this is the only fast type gate; `npm run build` also typechecks, via ts-loader.
- `npm run lint` — ESLint over `**/*.ts`
- `npm run prettier` — prettier check
- `npm test` — the fast gate: vitest projects `unit` (node, `test/unit/`) and `browser` (headless Chromium via Playwright, `test/browser/`). ~6s.
- `npm run test:demo` — the `demo` project (`test/demo/`): full playthroughs of the demo story in real Chromium, waiting on real transitions. ~32s, so it is deliberately **not** part of `npm test`. Run it when you touch the renderer, the commands, or `src/demoStory.ts`.
- `npm run test:all` — all three projects. `npm run test:unit` / `npm run test:browser` / `npm run test:demo` run one; `:headful` variants (`test:browser:headful`, `test:demo:headful`) show the browser; `npm run test:watch` watches the fast gate. Browser and demo tests need Playwright's Chromium installed (`npx playwright install chromium`).

## CI
`.github/workflows/ci.yml` runs on pushes to `master`, on every pull request, and on manual
dispatch. Three parallel jobs, roughly two minutes wall clock, then a deploy that only fires on
`master`:

- **check** — `npm ci`, then lint, prettier, typecheck, build.
- **test** — the fast gate (`npm test`). Playwright's Chromium is cached on `package-lock.json`;
  the apt system libraries are not in that cache, so `install-deps` still runs on a cache hit.
- **demo** — `npm run test:demo`, kept as its own job because it waits on real CSS transitions for
  ~35s and is the likeliest place for a timing flake on a shared runner. A flake there should read
  as "demo red" rather than poisoning the fast gate. If it does turn flaky, the ladder is
  `--retry=1`, then restricting the job to `push`.
- **deploy** — publishes the demo, `needs: [check, test, demo]` and gated on
  `github.event_name == 'push' && github.ref == 'refs/heads/master'`, so pull requests never reach
  it. See below.

Things worth knowing before editing it:
- **Nothing in CI exercises `npm run dev`.** webpack-dev-server changes must be verified by hand.
- **The test jobs deliberately have no build step.** Vitest serves `test-assets/` straight from the
  repo root, so `dist/` never enters the test path — verified by running the demo suite with `dist/`
  deleted.
- **Deploy does not rebuild.** `check` uploads `dist/` as the `dist` artifact (on PRs too, where it
  is just a downloadable preview build) and `deploy` downloads it, so the bytes that go live are the
  ones that were linted, typechecked and built. Do not add a second `npm run build` to `deploy`.

## Demo deployment
`deploy` clones [a544jh/webvn-demo](https://github.com/a544jh/webvn-demo), replaces its contents
with `dist/`, and pushes to `main` — which GitHub Pages serves at
<https://a544jh.github.io/webvn-demo/>. That repo is pure build output: no source, no CI, nothing
hand-written. Anything committed there by hand is gone on the next master push.

- **The copy is a mirror, not an overlay.** Everything but `.git` is deleted before `dist/` is
  copied in, so files the build stops emitting also disappear from the demo. (The first run prunes
  the stale `app.js.LICENSE.txt` / `playerIndex.js.LICENSE.txt` left by the 2023 hand-deploy.)
- **A `.nojekyll` marker is written on every deploy** so Pages serves the output verbatim instead of
  running it through Jekyll.
- **An unchanged build is a no-op.** The step stages the tree, and exits 0 without committing if the
  diff is empty — so re-running a deploy never adds a hollow commit.
- **Auth is a deploy key, not a token.** `DEMO_DEPLOY_KEY` holds the private half; the public half
  is registered with write access on `webvn-demo`, so it reaches that one repo and nothing else.
  `GITHUB_TOKEN` is read-only here (top-level `permissions:`) and has no access to the demo repo at
  all. To rotate, generate a new keypair and replace both halves.
- **That secret is an environment secret on the `demo` environment, not a repository secret.** Only
  a job declaring `environment: demo` can read it, so the other three jobs — and any workflow added
  later — cannot. Keep the environment's deployment branch rule limited to `master`: the job's `if:`
  is only yaml and anyone with write access can push a branch that edits it, whereas the environment
  rule is enforced by GitHub. Do not also create a repository secret of the same name. (Environments
  on a Free plan work because this repo is public.)
- **One deploy at a time, newest wins.** The job's own `deploy-demo` group (`cancel-in-progress:
  false`) keeps two deploys from ever running at once, and the default `queue: single` allows one
  pending entry, so a third arrival cancels and replaces the one waiting. Do not reach for
  `queue: max` (up to 100 pending) here — it would let an older build deploy over a newer one. None
  of this makes a deploy uninterruptible: the workflow-level group is keyed on `github.ref`, which
  every master push shares, so a newer push cancels the older run with its deploy job in it. That is
  the behaviour to want, and it is the other half of why ordering holds — exempting master from
  cancellation would let two runs race to completion and serialize on `deploy-demo` in test-finish
  order. A cancelled `git push` is not corrupting either: the ref update is atomic server-side, and
  the newer run deploys regardless.
- **Host keys come from `api.github.com/meta` over TLS**, not `ssh-keyscan`, so a fresh runner is not
  trusting whatever answers on port 22.

## Top-level layout
```
src/
  core/            state, player, VnPath, save, commands/*  (no DOM imports)
  yamlParser/      YamlParser.ts (script) + parseManifest.ts (manifest.yaml) — the parser actually used
  storage/         OPFS: primitives, project store, storing, the one-tab lock, the editor's resolver
  editorBoot.ts    opening a project out of the store, shared by src/index.ts and the test harness
  domRenderer/     DomRenderer + sub-renderers (textbox, sprite, bg, audio, decision, menus)
  reactRenderer/   incomplete React experiment — NOT wired up, do not rely on it
  pegjsParser/     earlier PEG.js grammar — NOT wired up
  editor/          CodeMirror editor
  picker/          the front door: the project library as a page, shown before any editor
  AppShell.ts      which view is up, the ordering that swap depends on, and the queue it runs in
  projectUrl.ts    which project is open, in the address bar: ?project=<directory>
  chrome/          what the editor and the picker both wear: the chrome font, the --vn-editor-* tokens, Lucide icons, the dialogs
  assetLoaders/    image/audio preloaders
  lib/             ConsecutiveIntegerSet
  types/           global .d.ts augmentations of lib.dom
test/              one directory per vitest project — the directory is what picks it
  unit/            node, no DOM
  browser/         real Chromium, fast gate
  demo/            real Chromium, full demo playthroughs, not in the fast gate
  helpers/         vnHarness.ts (DOM boot + queries), commands.ts (building commands),
                   testManifest.ts (TEST_MANIFEST, the manifest a test does not care about),
                   opfs.ts (scratch directories, and pointing the store at one),
                   navigation.ts (a fake address bar, which AppShell requires rather than
                   defaulting to the browser's)
experiments/       abandoned side tracks (elm, pixi, etc.) — shipped in repo, ignored by lint
test-assets/       the demo project — manifest.yaml, script.yaml and assets/, copied to dist/ by CopyPlugin
```

## Architecture — the parts worth understanding

### Immutable state + path replay
- `VnPlayerState` (src/core/state.ts) is almost entirely `readonly`. `State.advance(state)` returns a new snapshot.
- It also carries the project's `id` and `title`, seeded from the manifest and inert: no command reads either
  and `advance` writes neither. `id` is the save key, and holding it here is what stops a reload from writing
  one project's progress under another's — see ADR 0001's 2026-08-29 amendment before moving it back out.
- `VnPath` (src/core/vnPath.ts) records *user actions* (`Advance`, `MakeDecision`, `GoToCommand`) — not state snapshots. Saving stores this path in shorthand (decisions + trailing advances). Loading replays from `startingState` by reapplying actions.
- Consequence: commands must be **pure** with respect to state. Any nondeterminism (random, time, network) breaks replay. If you add one, seed it from state.
- **An action is recorded only when the playhead ended somewhere else — which is deliberately not the same
  question as whether the story moved.** `State.advance` hands back a fresh snapshot even at the end of the story
  — it rebuilds one, clearing the frame's transition and sfx flags, before finding there is no command left — so
  `newState !== state` reads as movement where there was none. `VnPlayer.playheadMoved` compares the index
  instead, which is the same test `Advance.tryPerform` uses to decide the replay moved: recording and replay ask
  one question, so they cannot disagree. They did once — advancing at the end recorded actions no replay could
  walk, and the next `undo` threw "path does not match the story" out of `VnAction.perform`. Reaching that end
  without clicking past it takes a script edited shorter under a `seenCommands` that still remembers the longer
  one, which is why `isNextCommandSeen` is bounded by `commands.length` as well.
  - **What the index cannot see is a loop back to where it started.** `advanceUntilStop` around a `label`/`jump`
    pair runs the whole loop and returns to the index it began on, so skip mode and the scroll wheel record
    nothing there and the next `undo` does nothing. A click is unaffected: `advance` takes a single step, and
    that step is the `jump`, which lands elsewhere before the automatic run walks back. Losing the action beats
    the throw it replaced, and it is one more way a looping story misbehaves — ROUGH_EDGES.md has three others.

### Command registration
- Every command module (e.g. `core/commands/text/TextBox.ts`) calls `registerCommandHandler("textbox", handler)` at import time.
- `core/player.ts` imports each command module purely for side effects. **If you add a new command, add its import to `player.ts`** — otherwise the YAML parser won't see it. This also means tree-shakers that drop "unused" side-effect imports would silently strip commands. Don't change webpack config in a way that enables aggressive side-effect elimination.
- Handler signature: `(obj: unknown, location: SourceLocation) => Command | ParserError`. Prefer `makeZodCmdHandler(schema, Ctor)` for new commands.
- Command keys must start with a lowercase letter. Capitalized keys are reserved for actor names in the `Name: "text"` (Say) shorthand.

### The editor's two buffers
- `VnEditor` is **one CodeMirror instance holding a `Doc` per buffer**, swapped with `swapDoc`, with a
  crude tab bar over it. That is CM5's own multi-buffer model and the 5.x spelling of the
  `EditorState`-per-file shape `design-docs/EDITOR.md` migrates to, so it is *ported* at the CM6
  migration rather than deleted; `design-docs/SCRIPT_INCLUDES.md` wants the same mechanism for N
  script files, and the tab bar is what grows into that file switcher.
- **Everything that means "the script" says so by name.** `parseDocument`, `goToLine`, the position
  marker and the render callback take `scriptDoc`, never "whatever is on screen" - a render while the
  manifest tab is up would otherwise move the manifest's cursor. Marker helpers take a `Doc`.
- **A detached `Doc` can still be marked.** `@types/codemirror` puts `setGutterMarker`/`clearGutter`
  on `Editor` only; CM5 defines both on `Doc.prototype`, and marker data lives on the line handle, so
  markers survive a swap. `src/types/codemirror.d.ts` declares them back. Load-bearing: adopting a
  manifest remarks the *script's* gutter while the *manifest* buffer is visible.
- **The manifest is adopted on blur, and only when its own buffer is dirty.** Blur is a much broader
  event than "I finished editing" - clicking the preview fires it - so an unguarded adoption would
  reload the story out from under the author. Note the two dirty flags point opposite ways: the
  manifest's dirtiness gates its adoption, and the script's cleanliness must never gate the reparse,
  because the script is untouched and its meaning changed anyway.
- Adopting means: parse; on failure mark the gutter and the tab and keep the last valid manifest (ADR
  0002); on success reparse the script against it, reload assets, then `reloadStory` + `render(false)`.
  A generation counter guards the `await` in the middle, the same hazard `renderGeneration` covers.
- **A tab wears the worst level marked in its own gutter** - `vn-editor-tab-error` red,
  `vn-editor-tab-warning` orange, nothing when the buffer is clean. One rule for both buffers, in
  `refreshTab`, which is why the tab cannot drift from the gutter it summarises: `markErrors` raises
  the level and `clearMarkers` resets it, so nothing else has to remember. It says the right thing in
  both buffers for free. On the manifest, red is a buffer that did not parse and was therefore never
  adopted - the preview is running a *different* manifest - and orange one adopted with a file
  missing under it. On the script, red is a story that could not be built as written (`story`
  missing, a bad anchor, a stray `---`) and orange one built with lines that do nothing (an
  unrecognized command, options that failed their schema, an undeclared reference). **The script tab
  matters most while the manifest is on screen**: since ADR 0004, fixing an id the script names is a
  manifest edit, so the buffer being edited is not the buffer holding the complaint.
- A missing file is marked at WARNING against the line that declared it, located by
  `declarationLocations(text, keys)`, because a filename is the one thing an author cannot check by
  reading the two documents. Not an error: the manifest is adopted anyway, and declaring art before
  it is drawn is the normal authoring order. Export is greyed out only while the manifest does not
  *parse*, because that is what the player refuses; a story that declares a file nobody has drawn yet
  still plays.
- `import * as CodeMirror from "codemirror"` is a namespace object under vite/esbuild and the callable
  itself under webpack. `src/editor/codeMirror.ts` unwraps it; call through that, not the namespace.

### The URL payload
- **Not to be confused with `index.html?project=<directory>`**, which names a project in *this*
  browser's store and carries nothing. `?vn=` is on `player.html` and carries a whole story, so it
  works anywhere; see "The open project is in the URL" under Project storage, and CONTEXT.md's
  _Payload_ and _Project link_.
- `?vn=` carries a **two-document YAML stream, manifest first**, gzipped and base64'd. `src/scriptUrl.ts`
  keeps the vocabulary `CONTEXT.md` sets: `encodeText`/`decodeText` are the transport over any text,
  `encodePayload`/`decodePayload` are the manifest-and-script pair. A
  single-document payload is refused rather than read as a script against a default manifest -
  `docs/adr/0003-the-url-payload-carries-the-manifest.md` says why, and says it because the next
  reader will want to accept one for backwards compatibility.
- The two-document form is **transport only**: `decodeProject` splits the stream with
  `splitDocuments` and hands each half to its own parser, so per-buffer gutters stay trivially
  correct. Both parsers refuse a multi-document input rather than taking `docs[0]` in silence.
- The payload carries the **raw manifest buffer text**, not a re-serialisation - round-tripping
  through the parser eats comments.
- **The demo boots through the same path.** With no `?vn=`, `playerIndex.ts` falls back to the demo as
  a source of `(manifestText, scriptText)`, so every demo load exercises the payload path.

### Manifest and the parser contract
- A project declares itself in `manifest.yaml`: `formatVersion`, `id`, `title`, `actors`, `backgrounds`,
  `audioAssets`. The three asset declarations are **keyed maps, not lists**: the script names an id and
  the manifest says which file it is, so the manifest is a symbol table rather than a preload index.
  `src/domRenderer/assetPaths.ts` is the one place an id becomes a path. Two functions per asset kind:
  `xFilePath(file)` for preloading and `xAssetPath(declarations, id)` for rendering, which has an id.
  The second is defined in terms of the first, so the directory prefix is written once and what is
  preloaded cannot drift from what is asked for. Do not re-spell `"assets/audio/"`,
  `"assets/backgrounds/"` or `assets/sprites/<actor>/` anywhere else — **and note the `assets/` level**,
  which is the project layout the store writes: everything above it is the project describing itself.
  That prefix belongs here and **not** in an `AssetResolver`, because it is part of the layout rather
  than part of where bytes come from. `declaredAssets(state)` is the one walk of all three declarations,
  yielding each path with the manifest key it was declared under; `loadAssets` preloads what it
  yields and reports failures out of the same list, so what is preloaded, what is asked for and what
  an error points at cannot come apart.
  `VnManifest` (src/core/manifest.ts) is that declaration as a type, and `seedState(manifest)` copies it
  into a starting `VnPlayerState`. It is an **input**, never a live field — nothing playback points into it.
- **The two parsers deliberately disagree about failure.** `parseStory` always returns a playable state, with
  errors alongside; `parseManifest` returns `[VnManifest | null, ParserError[]]` and yields nothing at all
  when validation fails, because a manifest that does not validate has no identity to load the project under.
  See `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` before "fixing" the asymmetry.
- **A reference the manifest does not answer warns and neutralizes its command.** After
  `storyToCommands`, `parseStory` runs `checkReferences` (`src/core/commands/references.ts`) over the
  built list. Each command declares the ids it names through `Command.references()` - exempting its
  own reserved values, so `#` stays with `bg` and `stop` with `bgm` - and an id no declaration
  answers becomes a `ParserError` at WARNING against the script line, with the command replaced by a
  `NoOp` holding it. The pass maps rather than filters: **the list keeps its length**, because
  `VnPath` records actions against command indices and every save is a path, so a dropped command is
  every later save replaying into the wrong scene. Declaring the id and reparsing mints the real
  command back at the same index. `Say` is the exception, via `survivesUndeclaredReference()`: the
  line is still said, in `default` styling with the raw id as its name tag. A new command that names
  an id has to override `references()` or its typos go unreported;
  `docs/adr/0004-an-undeclared-reference-neutralizes-its-command.md` has the reasoning, including the
  two alternatives it beat.
- `seedState` takes a required manifest. A no-arg call would mint an identity-less state, which is the thing
  `id` exists to prevent; tests use `TEST_MANIFEST` from `test/helpers/testManifest.ts`.
- The manifest schema is the one place the **actor-key casing rule** is stated as data. `YamlParser` decides a
  `Name: "text"` line is a Say by testing the key's casing, so a lowercase actor is one no script can speak
  as; `default` and `narrator` are the engine's own two exceptions.
- **`formatVersion: 1` is required**, and is checked *before* the rest of the schema. That ordering is
  load-bearing: a v0 manifest declares its assets as lists, so reading one under the v1 schema produces a
  shape error per declaration and buries the single message that explains all of them. A version failure
  is therefore the only error reported. The field arrived with asset ids, which is the compatibility break
  it was always waiting for; the next break bumps it.
- **Strict inside an entry, lenient at the top level.** An unknown key in an audio entry or an actor is a
  parse error, because `artistt:` should not silently produce a track with no artist, nor `sprits:` an
  actor declaring no sprites. An unknown key at the top level is still stripped, because that is how a
  later format announces itself. The two rules differ because the two situations do.
- **`stop` and a leading `#` are engine-level reserved values**, so they live in `src/core/state.ts`
  (`STOP_AUDIO_ID`, `isBackgroundColor`) rather than in the schema or the renderer. `Bgm.apply` acts on
  one and `BackgroundRenderer` on the other while the schema rejects both, and a rule spelled in two
  layers is a rule that drifts.

### Renderer contract
- `Renderer` interface in `src/Renderer.ts` is minimal: `render(animate)`, `loadStory(state, animate)`, `onRenderCallbacks`, `onFinishedCallbacks`, `loadAssets(state?)`.
- **The three throws on an id that will not resolve are invariant guards, not a failure mode.**
  `BackgroundRenderer`, `SpriteRenderer` and `AudioRenderer` still throw on an undeclared id, but the
  parse pass above guarantees none reaches them. All four wordings come from `undeclaredMessage` in
  `core/manifest.ts`, so a guard that does fire says what the author was already told. A *missing*
  file is a different matter and still reaches them - see below.
- **Where an asset's bytes come from is one interface, `AssetResolver`, and only `loadAsset` consults
  it.** `RelativePathResolver` is what the player, the deployed demo and every test use permanently;
  `OpfsAssetResolver` is the editor's. The **logical path stays the loader's key everywhere** —
  `registerAsset`, `getAsset`, `loadAll` and every failure report are untouched — which is what keeps
  the three render-time call sites synchronous map lookups. They have to be: two are structurally
  synchronous, and making them async pushes `await` into `DomRenderer.render`. The resolver is consulted
  *inside* `loadAsset`, after its already-loaded early return, so re-registering the whole project on
  every adopt-on-blur costs nothing; resolving ahead in `loadAssets` would be N reads per keystroke
  pause. `DomRenderer`'s two optional dependencies (`container`, `resolver`) travel in an options object.
- **`loadAssets` reports rather than refuses.** It resolves with the *declarations* whose file could
  not be loaded - the path, plus the key the manifest declares it under - scoped to the state it was
  given, since the loaders keep every path they have ever been handed and an old typo is not this
  story's. The key is what survives the trip: a loader only ever sees a path, and without it the
  editor could name the file but not mark the line. Declaring an asset before the art exists is the
  normal authoring order, so a missing file is not a reason to refuse a story; it is also invisible
  until the story reaches it and a sub-renderer throws on the null, hence the report. Making the
  renderers *survive* one is a separate change with its own blast radius.
- **Starting a story is `loadStory(state, animate)`, and nothing boots itself.** It swaps the story into the player and renders in one synchronous step; the auto-advance in `render` then walks to the first stop, painting every frame. Those two steps must not be separated by an `await` — `render` bumps `renderGeneration`, and that bump is the only thing that stops a pass still in flight from auto-advancing the story that replaced it. A bare `player.loadState` followed by an awaited asset load is exactly the bug this replaced. `animate` is the caller's choice: the player passes `true` so an intro or title screen plays out, the editor passes `false` so reloading a script lands on the first stop without replaying the opening.
- `DomRenderer` owns: input handling, menu orchestration, skip/auto, localStorage save, asset loading, render loop, scaling on fullscreen. It's ~520 lines and growing — candidates for extraction if you touch it.
- **Fullscreen is `enterFullscreen()`, and the button that calls it is not the renderer's.** The mechanism — request, orientation lock, the scale that letterboxes the fixed-size scene, and the `fullscreenchange` listener that undoes it — lives in `DomRenderer`; the `#vn-btn-fullscreen` chrome sits outside the vn root in both HTML files, so each entry point keeps one line of wiring. The element scaled *into* is the constructor's `container` option, defaulting to the root: it too is outside the root, so the renderer is told it rather than walking up to `parentElement`, and a renderer mounted without a container (every test — `createVnRoot` puts `#vn-div` straight under `<body>`) scales to 1 and pads nothing. Nothing automated covers any of this: `requestFullscreen` needs user activation, so verify by hand with `npm run dev`.
- Sub-renderers receive `animate: boolean`. When `animate` is false, they must jump straight to end-state, which means removing listeners and cancelling in-flight transitions (most use `cloneNode()` to drop listeners — follow that pattern).
- Sub-renderers read prev state via `renderer.getCommittedState()`. `DomRenderer.committedState` is set synchronously **before** the `Promise.all(...).then()` runs, so reads inside scheduled microtasks see the *new* state. Always capture `prev` synchronously at the top of a sub-renderer's `render`.
- Renders can overlap: a rapid click triggers `render(false)` while an animated render's promises are still pending. `DomRenderer.render` stamps each pass with `renderGeneration` and the completion callback bails if superseded — completion side effects (`finished = true`, auto-advance) must stay behind that guard, since sprite `transitionend` promises can resolve long after their render was replaced.
- **The generation guard only shows its worth while the story is still moving.** Once the player is parked on a stop, a stale auto-advance is a no-op anyway, so most overlapping-render scenarios pass with the guard deleted — including the two sprite cases in `test/browser/DomRendererRapidClick.test.ts`, which were cited here as its regression net and are not. **The real net is the demo suite**: delete the guard and five of its decision tests fail, because the decision click's effect is lost and the story stays on the prompt. Reaching that window through clicks needs a scene's worth of animations still pending underneath, which is why it takes the demo story to do it. Nothing in the fast gate covers it, and an attempt at a fast-gate test was dropped rather than kept: every reproduction small enough for that suite — a click during a sprite walk, `advanceFast` over it, a decision click on a minimal branching story, two overlapping renders mid-flight — behaves the same with the guard deleted, and the only version that failed had to induce the overlap in a way no caller does. **If you rewrite the render loop, run `test:demo`** — `npm test` will not tell you that guard is gone.

### Project storage — where an author's project lives
`src/storage/`, all of it browser-only and none of it imported by `core/`. Tranche 1 of
`design-docs/PROJECT_STORAGE.md`, landed 2026-08-30.
- **`opfs.ts` is the filesystem layer and knows nothing about projects.** Every function takes the
  directory handle it works under, so nothing holds global state. **`writeFile` is a plain write, on
  purpose**: the File System Standard is normative that nothing reaches the file until the stream is
  closed, so a write is already atomic and a tmp-then-`move()` scheme on top is redundant - it shipped
  briefly and was dropped 2026-08-30, because the tmp file was itself written with `createWritable`
  (hedging a primitive with itself) and a crash between `close()` and `move()` left a stray `.tmp`
  that the walk, the listing and an export all picked up. Read `writeNow`'s comment before adding one
  back. Writes are still **serialized per path**, which is a separate concern: it makes the *last
  queued* write win, which is what a debounced store wants. `isSupported()` gates the whole editor.
- **`projectStore.ts` is `projects/<id>/{manifest.yaml,script.yaml,assets/}` plus `editor.yaml`.** Two
  truths that are easy to conflate: **enumeration** is the truth about what exists (`listProjects` walks
  the directory; there is no index file, ever), and **the manifest** is the truth about what a project
  *is* (nothing rewrites an id to match a directory - the fix for a disagreement is to rename the
  directory, which is the rename ticket's). Reads and writes are addressed by **directory**, never by
  id. A directory with no manifest is not a project and is skipped; one whose manifest does not *parse*
  **is** listed, with a null id, because that is an author's project with a typo in it. `editor.yaml`
  deliberately has no schema version: it is defined as losable, and "unparseable reads as empty" is the
  migration strategy.
- **`OpfsAssetResolver` mints one object URL per path and never revokes.** The loaders never evict and
  `getAsset` hands out a `cloneNode()` that re-fetches its `src`, so a revoked URL is an element that
  silently never loads. `test/browser/objectUrlLifetime.test.ts` pins both halves of that.
- **`ProjectStoring.ts` is the debounce**, 2000ms, plus flushes on blur, on `visibilitychange` to
  hidden, and on `pagehide` (never `unload`). **The debounce is the guarantee and every flush is a
  bonus** — no unload-time hook can promise an async OPFS write completes, so do not lengthen the
  interval on the theory that the flushes cover it. It stores **the buffer, not the parse**: a manifest
  that does not parse is still the author's work and is the edit they most want back. Its indicator is a
  filled badge, not coloured text - green stored, `orange` unstored, `red` failed, the two problem
  colours being the literal ones `setErrorMarker` paints the gutter with. **It never removes its page
  listeners**, which is fine while one page load means one storer and is a data-loss bug the moment
  project switching remounts in place - its constructor comment has the reproduction.
- **`projectLock.ts` takes a `navigator.locks` lock keyed on the directory, before the boot writes
  anything.** A second tab is refused rather than racing the first one's writes. Ordering is the point:
  the picker's walk writes nothing, the lock is taken, and only then is `lastOpened` recorded.
- **`editorBoot.ts` is the boot, lifted out of `src/index.ts` so tests exercise the one that ships.** It
  returns either a booted editor or a refusal — four reasons, one surface, the fourth being a
  directory that is no longer a project (a bookmark to a deleted one, or a picker row racing a
  delete in another tab); it is asked with the lock in hand, because a delete takes the same lock.
  It hands back an `openProject` thunk rather than opening the buffers itself, because the export
  gate has to be listening before the load reports how the manifest fared.
- **`close()` is beside it, and it is what makes a second boot in one page safe.** Flush, stop the
  storer, tear the renderer down, empty the editor's root, release the lock — the thing that built
  the session takes it down. `DomRenderer.teardown()` restores the vn root to the markup it was
  handed rather than emptying it, because the action bar is page markup the renderer only queries;
  emptying it would leave the next session without one. It also tears down the **two sub-renderers
  that own something outside the root**: `AudioRenderer` plays through detached `<audio>` clones that
  never enter the document (so a looping track survived every other kind of teardown — it shipped
  that way and played over the picker), and `BackgroundRenderer` reschedules `requestAnimationFrame`
  while a transition or pan has frames left. `test/browser/CloseProject.test.ts` covers
  the whole of it, including the measured stale-storer loss end to end.
- **Vocabulary**: the editor **stores** a project, the store **writes** files, and a **save** is the
  player's. `CONTEXT.md` has the entry, with `save`, `autosave` and `persist` on its _Avoid_ list.
- **`src/picker/` is the front door, and it is a view rather than a third html entry.** The app stays
  one page: `index.html` holds `#vn-picker` and `#vn-session`, `src/AppShell.ts` swaps them with
  `hidden`, and opening a project never reloads. The picker walks `projects/` on every render — enumeration is
  the truth, there is no index file — orders by `created`, oldest first, so the list never moves under
  the author, and hands a directory to `bootEditor`. `editor.yaml` holds `created` and `lastOpened`
  as two maps keyed by directory; `createProject` dates a project and `forgetProject` un-dates a
  deleted one, so a reused id cannot inherit its predecessor's place. Rows still show when each was
  last opened — recency as information, not as the sort. OPFS cannot supply creation order: measured,
  Chromium enumerates by descending name with no insertion component, and the standard defines no
  order at all. Its
  layout comes from the design canvas `.scratch/project-library/design.md` links, which is binding
  for pixels — read it before changing what the picker or the dialogs look like. It has a `stop()` and a generation guard for the same reason `ProjectStoring` has a
  `stop()`: a superseded view that kept listening is a bug, not untidiness. Its font, icons and
  status colours come from `src/chrome/`.
- **`bootEditor` is *told* which directory to open.** `chooseProject`/`claimProject` are gone with
  `openProject.ts`: their two jobs — which directory, and seed the demo if the library is empty —
  are the author's pick and the picker's Add demo project button. A cold boot always lands on the
  picker; `lastOpened` orders the list and no longer decides anything. `bootEditor` records it after
  the lock, so a rename gets it free.
- **`seedDemoProject` is scaffolding with one caller left**, the picker's Add demo project button.
  Nothing seeds behind the author: a seed would have to run before the picker could render, when no
  lock is held, and a refused tab must not have written anything. It dies at URL import in tranche 3.
- **`--vn-editor-font-mono` is the chrome's own monospace**, carrying the same face as the stage's
  `--vn-font` and spelled separately on purpose: a chrome rule reading `--vn-font` lets a theme swap
  restyle the picker, which is the coupling the two namespaces exist to prevent. `debugPanel.css` is
  the documented exception and keeps `var(--vn-font)`.
- **The dialogs are `src/chrome/dialog.ts`, built on `<dialog>` + `showModal()`.** Not
  `window.confirm`/`window.prompt`: an id needs the schema's message beside the field it belongs to,
  and the platform supplies the backdrop, top layer, focus trap and Escape for free. `validate`
  refuses a confirm and keeps the dialog up with what was typed still in it. Two hosts, so it belongs
  to neither: the picker opens these with no editor mounted, a rename will open one from inside an
  editor.
- **`createProject(id, files)` takes files; `mintProject(id, title)` makes a new one.** The minted
  manifest is `stringify`d, not interpolated — `validateProjectId` accepts `true`, `false` and
  `null`, which YAML reads as scalars, so an interpolated `id: true` produced a manifest that does
  not parse; and a title is free text where a quote or a newline would break hand-rolled quoting.
  `createProject` writes the manifest **first**, so a project being made never presents as the
  manifest-less residue a crashed rename leaves.
- **`AppShell.ts` owns the swap, and one ordering in it is load-bearing: the session is revealed
  *before* `bootEditor` runs.** `BackgroundRenderer`, `SpriteRenderer` and `FreeformTextRenderer`
  each read the root's `clientWidth`/`clientHeight` in their **constructors**, and the background
  canvas is sized from what they read — so a renderer built inside a `hidden` subtree gets a 0x0
  canvas that never paints and a scene size of zero that mispositions every sprite. Nothing throws;
  the only symptom is a blank stage. Shipped once, 2026-09-05. `DomRenderer`'s constructor now logs
  when its root measures zero, and `test/browser/AppShell.test.ts` pins the ordering.
- **Every view swap runs in a queue, one at a time.** `AppShell.queue` chains them, and it is what
  makes back-and-forward safe: two swaps in flight interleave, and the older one's `showPicker`
  lands *after* the newer revealed the session — hiding it again under a renderer that has not
  measured itself, which is the 0x0 canvas above reached from a new direction. A queue rather than
  the generation guard `DomRenderer.render` and `ProjectPicker` use for their version of this: those
  two can drop a superseded pass because painting is all it would have done, while a swap holds a
  lock and a storer and has to finish. A rename is queued too, dialogs included, so a `popstate`
  cannot close the session it is about to move — unqueued it closed that session twice and drew the
  list, which is what `RenameProject.test.ts`'s "wins a race with a Back" pins. **A queued swap reads
  the URL at its turn**, not when the navigation fired: a back-and-forward burst collapses instead of
  tearing the project down, and a rename landing while a Back waits behind it wins, the Back being
  swallowed rather than left drawing the picker under a URL naming the renamed project.
- **That swap lives outside `src/index.ts` for the same reason `editorBoot.ts` does.** The entry
  point self-boots on import and looks its elements up by id, so no suite can reach it — put
  stateful logic there and it ships untested. Every other browser suite mounts through
  `createVnRoot`, straight onto a visible body, so none of them can see a hidden-mount bug either.
- **The open project is in the URL: `index.html?project=<directory>`, `src/projectUrl.ts`.** A
  reload, and webpack-dev-server's reload-on-save, land back in the project rather than at the front
  door. It carries the **directory**, because that is what `bootEditor` is told and what a project
  whose manifest does not parse still has. A bare URL is still the picker, so ticket 02's "a cold
  boot always enters the picker" stands — `lastOpened` deciding is the app guessing, a URL deciding
  is the author having said. Three ways a directory arrives and one routine for two of them: the
  first load and every back/forward go through `goTo`, which **records nothing back** to the URL
  (it does replace it with the bare one when the link will not open), while `openProject` and
  `backToProjects` are the author's own gestures and push *after* doing the work. That split is what
  stops a `popstate` pushing an entry for the move it is reacting to. A rename **replaces** rather
  than pushes, overwriting the entry that named the old directory — that entry and no other, so an
  older entry naming the same project survives a rename and walks back into the boot's fourth
  refusal. A URL naming a project that will not open lands on the picker with the reason in its
  banner and the URL replaced with the bare one, because the invariant worth keeping is that the URL
  matches the view; the refusal carries its own **advice** line alongside its reason, since the
  picker appending one hard-coded sentence to every reason read as "There is no project called "x".
  Close it there." the moment a second reason existed. `AppShellOptions.navigation` is **required**,
  not defaulted to `browserNavigation()`: the browser suites run in a page whose URL is vitest's.
  `.scratch/project-library/issues/06-the-open-project-in-the-url.md` has the format comparison.
- **Renaming is the directory following the manifest's id, and never the reverse.** The trigger is
  manifest adoption: `VnEditor.onManifestAdoptedCallbacks` reports, `AppShell.rename` compares the id
  to the directory and acts — storage stays out of `src/editor/`. Two orderings matter. The store's
  (`renameProject`) is overwrite-delete → marker → copy everything but the manifest → **write the
  manifest, which is the commit point** → delete the source → clear the marker and carry
  `created`/`lastOpened` across. The session's is ask → check room → ask about an overwrite → take
  the destination lock → **close** → move → reopen: the lock before the close so a refusal never
  strands the author, and the close before the copy so a live storer cannot write into the tree
  mid-copy. `bootEditor` takes an already-held lock for exactly this caller.
  The session is carried across, not just the files: `VnPlayer.restorePath` replays the old path
  against the rebuilt player (a rename does not touch the script, so it replays whole), and the
  session's global save is written by hand under the old id before the move — a close flushes the
  buffers and not the save data, and `seenCommands` moves on every undo and decision without one.
- **`opfs.ts`'s `writeFile` streams a Blob** (`blob.stream().pipeTo(writable)`; `pipeTo` closes the
  stream itself, so no `close()` after). `copyTree` is the one recursive copy — a rename's today,
  export and import's later — and it goes through `writeFile`, so it is serialized per path like
  every other write rather than being a second way to put bytes on disk.
- **`recoverProjects.ts` runs before the picker's list walk, on every render.** It finishes a rename
  whose tab was killed, and sweeps directories with no `manifest.yaml`. **The destination's manifest
  is the only question it asks**: absent means the copy never committed (drop the marker, let the
  sweep take the half-copy), present means the tail is what did not finish (`completeRename`, which
  the rename itself also calls — so a crashed rename becomes what an uninterrupted one would have
  been). The marker is a hint and can never on its own cause a delete; both deletes take the lock on
  what they are about to remove, because between commit and delete *both* directories are valid
  projects and a rename in flight elsewhere holds a manifest-less destination. A manifest that does
  not parse is **not** swept — that is an author's project with a typo in it. Neither is a manifest
  with no script: that is the state `createProject` passes through between its two writes, and
  deleting on it would be a wrong delete. **Every step is wrapped so recovery can never stop the
  picker drawing** — a browser interrupted mid-delete still holds the tree and throws
  `NoModificationAllowedError`, and that rejection used to reach the entry point's catch and replace
  the whole library with "Something went wrong". A failure leaves the marker standing and the next
  render retries.
- **`navigator.storage.persist()` is asked on the first store**, at most once per page load
  (`src/storage/persistence.ts`), and the answer is reported rather than assumed — the picker shows
  `persisted()`, re-read on every render.

### Save/load
- `VnGlobalSaveData` contains `seenCommands` (interval-encoded integer set) + `saves[]`. `seenCommands` is intentionally **global and mutable** — once a command is seen, it stays seen across undo, save slots, and replays. This is standard VN behavior: skip-mode only fast-forwards through text the player has already read. It lives on `VnPlayerState` for convenience but is not part of the immutable snapshot contract; don't try to "fix" it without a real reason.
- Save slots are `{ timestamp, path: number[] }` where `path` is `[...decisions, remainingAdvances]`.
- Persisted via `saveToLocalStorage(id, data)` under key `vn-save-<id>`, where `id` is the manifest's.
- **An id is reusable, so anything that changes or destroys one has to move or drop its saves.** A
  save left under a freed id is inherited by the next project to claim it, and its paths describe a
  story that project does not have — replay throws and `SaveLoadMenu` has no `try`/`catch`, so Load
  becomes a dead button. `moveSaveData(from, to)` carries them on a rename and **clears `to` when
  `from` has none**, which is what stops a renamed-onto project adopting the saves of the project it
  destroyed; `deleteSaveData(id)` is delete's half, keyed on the manifest's id rather than the
  directory.
  The two-level prefix is `design-docs/PROJECT_STORAGE.md`'s: localStorage is origin-wide, so an
  author-chosen id needs a keyspace separate from the app's own, and it leaves `vn-editor-*` free.
  The key comes off the state - `seedState` copies the manifest's `id` and `title` in, so a reload
  carries the key with it and no caller can swap the story without swapping the key (ADR 0001's
  2026-08-29 amendment; the threaded `setSaveId` it replaced had a silent wrong-key failure mode).
  An in-session id change is a project rename by the crudest definition: later writes go to the new
  key, nothing migrates, nothing re-reads the old one.
- `loadFromLocalStorage` does **not** validate shape beyond `JSON.parse`. Only `ConsecutiveIntegerSet.fromJSON` uses Zod. Be defensive if you add fields.

## Conventions
- Prettier config: `printWidth: 120`, `semi: false`. ESLint extends `eslint:recommended`, `@typescript-eslint/recommended`, `prettier`.
- File names: PascalCase for classes (`TextBoxRenderer.ts`), camelCase for modules of functions (`booleanExpression.ts`, `transitionFactories.ts`).
- No emojis in code or commits.
- CSS lives next to the renderer that uses it and is imported via `import "./x.css"` (handled by style-loader).

## Known rough edges — read before changing
See [ROUGH_EDGES.md](./ROUGH_EDGES.md) for the running list of typos, design smells, and dead code paths that propagate through imports. Skim it before changing the affected areas; consider fixing rather than working around.

## Design docs — decisions not yet built
`design-docs/` holds architecture that has been reasoned through but not implemented. It is not documentation of
the current code, so do not read it as describing what exists - with one exception: as parts of a doc get built,
the section describing each is marked **Landed** with a date in place, rather than deleted. Those markers are
the only sentences in `design-docs/` that describe the present tense, and they exist so a reader can tell a
prescription that is still waiting from one that is now code.

**They are binding, not merely topical.** Each one already *decides* things, often in more detail than a reader
skimming for its subject expects — mechanisms, key formats, UI triggers, and enumerated audits of existing code.
Before deciding something in their territory, check whether they have already decided it: this has been
rediscovered the expensive way more than once, most recently in `.scratch/manifest-editor/`, which re-derived a
mechanism `SCRIPT_INCLUDES.md` prescribes outright. The list below says what each one settles, not just what it
covers.

- [PROJECT_STORAGE.md](./design-docs/PROJECT_STORAGE.md) — how an author's project (script, assets, metadata) is
  stored while editing and how it leaves the browser: OPFS as the working copy, a `.webvn.zip` archive as the
  canonical artifact, a library of projects rather than one, and four ingestion paths sharing one back half
  behind a `SourceLoader`. Read it before touching the asset loaders, `src/domRenderer/assetPaths.ts`, the
  editor's boot path, or anything that writes to localStorage.
  **Already decides:** the save key is `vn-save-<id>` and why the prefix exists; renaming a project orphans the
  old key deliberately rather than migrating; the rename dialog is triggered from the manifest *on editor blur*,
  and blur's weaknesses (incidental focus changes, never fires on a tab close) are named there. Its `assets/`
  layout is now what the code builds.
  **Its first six tickets landed 2026-08-30** and are now `src/storage/` - see "Project storage" above, and
  `.scratch/project-storage/` for the reasoning behind each. What is left of the doc is everything that
  follows from having a store: the picker, rename, import, export and the nag. That spec still carries the
  vocabulary rule that the editor **stores** a project while a **save** is the player's.
- [SCRIPT_INCLUDES.md](./design-docs/SCRIPT_INCLUDES.md) — splitting a story across YAML files with an
  `include` directive, resolved at parse time rather than as a command. Read it before changing
  `SourceLocation`, `storyToCommands`, `updateLabels`, or the editor's buffer handling.
  **Already decides:** the multi-buffer mechanism — one `CodeMirror.Doc` per file swapped with `swapDoc`, a file
  switcher, markers filtered to the open buffer plus an indicator that a *different* buffer has errors, and
  "clean" redefined as all buffers clean. **Half of that landed with manifest editing** and the section says
  which half; what is left is the part that is about N files rather than two, enumerated there with line
  numbers, so that audit does not need doing again.
- [EDITOR.md](./design-docs/EDITOR.md) — autocompletion, command documentation, list continuation and
  find-in-file for the script editor, and the CodeMirror 6 migration under them (5.x was archived in April
  2026). Read it before touching `src/editor/`, the command registry, or the `codemirror` dependency.
  **Already decides:** the 5.x-to-6 API mapping, one row per call the editor makes — including `swapDoc` to
  `view.setState()`, which is what makes a `Doc`-per-buffer editor a port at migration time rather than a
  deletion.

Sequencing across the three lives in [TODO](./TODO), which folds the dependency graph between them into the
backlog rather than leaving an ordering nobody wrote down.

## Things that are NOT used — do not rely on them
- `src/reactRenderer/` — partial, no decisions/sprites/bg/audio. Left in the repo per README but not reachable from either entry point.
- `src/pegjsParser/` — superseded by `YamlParser`. Not imported anywhere that ships.
- `experiments/` — side tracks, listed in `.eslintignore`.

If you're tempted to import from any of these, don't.

## Commit / branch workflow
- Develop on the branch specified by the task instructions (for agent-driven work this is usually `claude/<something>`).
- Create a NEW commit rather than amending; never skip hooks (`--no-verify`) or force-push without explicit user approval.
- Do not open a pull request unless explicitly asked.
- Commits end with the Claude Code session link footer when made by an agent.

## Typical tasks and where to start

- **Add a new command (e.g. `wait`, `setVar`)**: create `src/core/commands/<area>/YourCommand.ts`, define a Zod schema, subclass `Command`, call `registerCommandHandler`. Then add a side-effect import in `src/core/player.ts`. If it names an
  asset or actor id, override `references()` so a typo is a warning rather than a crash, exempting
  any value the engine has spoken for. Add an example line to the demo YAML in `src/demoStory.ts`, which both entry points load, and extend `test/demo/DemoStory.test.ts` to cover it.
- **Add a new background transition**: create in `src/domRenderer/bgTransitions/`, call `registerTransition(name, factory, optionsSchema)`. The schema is wired into the `bg` command's options automatically.
- **Add a new renderer sub-component**: follow `SpriteRenderer` / `BackgroundRenderer` — constructor takes `vnRoot`, `renderer`, optional asset loader; `render(...)` returns a Promise that resolves when animations complete. Each takes its slice of `animatableState` plus, where it resolves asset ids, the declarations that slice does not carry (`render(sprites, actors, animate)`, `render(bg, backgrounds, animate)`, `render(audio, audioAssets)`) — a narrower dependency than handing every sub-renderer the whole `VnPlayerState`. Be careful with the `animate=false` path (drop listeners, cancel transitions).
- **Touch anything about where files live**: read "Project storage" above first, then
  `design-docs/PROJECT_STORAGE.md` for the parts still unbuilt. `src/storage/opfs.ts` is the only place that
  talks to OPFS, `src/storage/projectStore.ts` is the only place that knows the `projects/<id>/` layout, and
  `src/domRenderer/assetPaths.ts` is the only place that builds an `assets/` path. The browser suites share
  one origin and run their files in parallel, so a test that writes into OPFS needs `test/helpers/opfs.ts`'s
  scratch directory rather than the root.
- **Change the save format**: bump/validate in `loadFromLocalStorage`; keep an eye on `toShorthandPath` and `fromShorthandPath` — those two plus `ConsecutiveIntegerSet.toJSON/fromJSON` define what persists.
- **Add tests**: the directory a test sits in is what picks its vitest project — `test/unit/` (node), `test/browser/` (real Chromium — CSS transitions/animations actually fire, so render promises resolve like in production), `test/demo/` (whole-story playthroughs, which only `npm run test:demo` runs). Nothing keys off the filename, so a browser test misfiled under `test/unit/` runs in node and dies on a missing `document`. Put a test in the demo project only if it needs to walk a long stretch of a story — anything narrower belongs in `browser` so it stays in the fast gate. Start from `test/helpers/vnHarness.ts`: `startEditor(manifestText, script)` mounts player, renderer and editor over one root (with `typeManifest`/`blurEditor` to drive an adoption), `startVn(script)` parses a YAML story, mounts a `DomRenderer` into a fresh root and resolves at the first stop (pass `{ manifest }` when the script names assets or actors - `TEST_MANIFEST` declares none, and an undeclared asset now throws in the renderer), `nextStop(renderer, player)` waits for the next one, and `textBoxText`/`spriteElems`/`liveSprites`/`decisionItems` read the result out of the DOM. Node-side suites build commands through `test/helpers/commands.ts` instead. `ConsecutiveIntegerSet`, `VnPath` and the core state machine are covered; `test/browser/DomRenderer.test.ts` is the smoke test for the DOM render path; `test/demo/DemoStory.test.ts` covers the demo end to end. Sub-renderer promises must resolve even when there is nothing to animate, or the render loop stalls (see the empty-children guard in `DecisionRenderer.render`).

## Build tooling caveats
- Package manager is **npm** (`package-lock.json`). Do not reintroduce `yarn.lock`; the two are not interchangeable here. npm enforces peer dependencies and yarn 1 ignored them outright, so the same `package.json` resolves to a different tree under each. That is also why `yaml` must stay at a version vite accepts for its optional `yaml: "^2.4.2"` peer: drop below it and npm refuses to hoist `vite`, which breaks `@vitest/browser` with `Cannot find package 'vite'` in every test file.
- `webpack-dev-server` is on v6 and `webpack-cli` on v7, against webpack 5 (still the latest major — there is no webpack 6). Three things about that config are load-bearing:
  - `devServer.static: false`. v4+ replaced v3's `contentBase` (which defaulted to the CWD) with `static.directory`, defaulting to `./public` — a directory this repo does not have. Nothing is served off disk: the html goes through `file-loader` via the `import "./index.html"` side effects and `test-assets` through CopyPlugin, so both land in the compilation and are served from memory by webpack-dev-middleware.
  - `process.env.WEBPACK_SERVE` gates `devtool: "eval-source-map"`. v3 set `WEBPACK_DEV_SERVER`; v4+ sets `WEBPACK_SERVE`. Getting this wrong does not error — dev builds just silently lose their source maps.
  - dev-server 6 requires **node >= 22.15**. CI pins `node-version: 22`, which resolves above that, but dropping the CI node version would break `npm run dev` only, and nothing in CI would notice.
- The `resourceQuery: /raw/` rule (`type: "asset/source"`) is what makes `import yaml from "./x.yaml?raw"`
  work in the build. It matches vite's native `?raw` suffix on purpose, so `src/demoStory.ts` has one
  spelling that works in webpack and in all three vitest projects; the ambient module declaration for it is
  `src/types/yamlRaw.d.ts`. Nothing but the demo's two YAML files uses it yet, and nothing in CI would catch
  its removal except the build.
- Nothing automated covers `npm run dev` — verify it by hand after touching webpack config. HMR is on by default in v4+; with no `module.hot` handling in the app a source edit triggers a full page reload.
- `@types/react` is in `dependencies` but should be `devDependencies`.
- `src/types/screenOrientation.d.ts` declares `ScreenOrientation.lock` back into `lib.dom`, which dropped it in TS 5.9. It is a global augmentation (no imports/exports), picked up because `tsconfig.json` has no `include`. Both fullscreen call sites `.catch()` the rejection non-mobile browsers give.
- `tsconfig.json` targets `es6` / `module: es6`. `allowJs: true` is needed for `pegjsParser/parserWrapper.js` only. `skipLibCheck: true` is load-bearing, not cosmetic: `moduleResolution: "node"` predates `exports`/`imports` subpath maps, so vite and rollup declarations resolve to nothing, and several dependencies ship `.d.ts` files that error under the TypeScript we build with. Without it `tsc --noEmit` reports 17 errors under TS 5.9, every one of them inside `node_modules`. It does not weaken checking of our own code against those libraries.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo, committed alongside the code. See [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md).

### Triage labels

The five canonical triage roles, each label string equal to its name. See [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Single-context: one [CONTEXT.md](./CONTEXT.md) at the repo root, and `docs/adr/`. Both exist. See
[docs/agents/domain.md](./docs/agents/domain.md).

`CONTEXT.md` is the glossary, and it is opinionated: terms carry an `_Avoid_` list naming the words this project
does *not* use for that concept. Check a term against it before coining one, and add resolved terms as they
settle rather than in a batch. Two distinctions it draws that are easy to trip over: a **script** is the text and
a **story** is the command sequence parsed from it; a command is **applied** to a state, while a manifest is
**adopted** by the editor.

The ADRs, newest first:
- `0003-the-url-payload-carries-the-manifest.md` — the `?vn=` payload is a two-document YAML stream, manifest
  first, and a single-document payload is refused rather than defaulted.
- `0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` — why `parseStory` always returns a state and
  `parseManifest` may return none.
- `0001-manifest-seeds-the-initial-state.md` — why the manifest seeds `VnPlayerState` rather than living beside
  it, why `id` and `title` live on the manifest rather than a wrapping type (2026-08-28 amendment), and why
  `seedState` copies them into the state anyway (2026-08-29 amendment).
