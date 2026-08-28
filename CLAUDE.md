# CLAUDE.md

Notes for Claude Code (and other agents) working in this repo. Derived from a repo-wide review; keep in sync when the architecture shifts.

## What this is
A client-side visual novel engine + authoring tool. TypeScript, webpack. The "real" renderer uses direct DOM + Canvas2D APIs (no UI framework). Script language is YAML, parsed by the `yaml` lib. Commands self-register via side-effect imports.

Two entry points:
- `src/index.ts` → editor + live-preview player (demo/authoring)
- `src/playerIndex.ts` → standalone player, can load a script from `?vn=<base64 gzip YAML>`

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
  domRenderer/     DomRenderer + sub-renderers (textbox, sprite, bg, audio, decision, menus)
  reactRenderer/   incomplete React experiment — NOT wired up, do not rely on it
  pegjsParser/     earlier PEG.js grammar — NOT wired up
  editor/          CodeMirror editor
  assetLoaders/    image/audio preloaders
  lib/             ConsecutiveIntegerSet
  types/           global .d.ts augmentations of lib.dom
test/              one directory per vitest project — the directory is what picks it
  unit/            node, no DOM
  browser/         real Chromium, fast gate
  demo/            real Chromium, full demo playthroughs, not in the fast gate
  helpers/         vnHarness.ts (DOM boot + queries), commands.ts (building commands),
                   testManifest.ts (TEST_MANIFEST, the manifest a test does not care about)
experiments/       abandoned side tracks (elm, pixi, etc.) — shipped in repo, ignored by lint
test-assets/       the demo project — manifest.yaml, script.yaml and the asset dirs, copied to dist/ by CopyPlugin
```

## Architecture — the parts worth understanding

### Immutable state + path replay
- `VnPlayerState` (src/core/state.ts) is almost entirely `readonly`. `State.advance(state)` returns a new snapshot.
- `VnPath` (src/core/vnPath.ts) records *user actions* (`Advance`, `MakeDecision`, `GoToCommand`) — not state snapshots. Saving stores this path in shorthand (decisions + trailing advances). Loading replays from `startingState` by reapplying actions.
- Consequence: commands must be **pure** with respect to state. Any nondeterminism (random, time, network) breaks replay. If you add one, seed it from state.

### Command registration
- Every command module (e.g. `core/commands/text/TextBox.ts`) calls `registerCommandHandler("textbox", handler)` at import time.
- `core/player.ts` imports each command module purely for side effects. **If you add a new command, add its import to `player.ts`** — otherwise the YAML parser won't see it. This also means tree-shakers that drop "unused" side-effect imports would silently strip commands. Don't change webpack config in a way that enables aggressive side-effect elimination.
- Handler signature: `(obj: unknown, location: SourceLocation) => Command | ParserError`. Prefer `makeZodCmdHandler(schema, Ctor)` for new commands.
- Command keys must start with a lowercase letter. Capitalized keys are reserved for actor names in the `Name: "text"` (Say) shorthand.

### Manifest and the parser contract
- A project declares itself in `manifest.yaml`: `id`, `title`, `actors`, `backgrounds`, `audioAssets`.
  `VnManifest` (src/core/manifest.ts) is that declaration as a type, and `seedState(manifest)` copies it
  into a starting `VnPlayerState`. It is an **input**, never a live field — nothing playback points into it.
- **The two parsers deliberately disagree about failure.** `parseStory` always returns a playable state, with
  errors alongside; `parseManifest` returns `[VnManifest | null, ParserError[]]` and yields nothing at all
  when validation fails, because a manifest that does not validate has no identity to load the project under.
  See `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` before "fixing" the asymmetry.
- `seedState` takes a required manifest. A no-arg call would mint an identity-less state, which is the thing
  `id` exists to prevent; tests use `TEST_MANIFEST` from `test/helpers/testManifest.ts`.
- The manifest schema is the one place the **actor-key casing rule** is stated as data. `YamlParser` decides a
  `Name: "text"` line is a Say by testing the key's casing, so a lowercase actor is one no script can speak
  as; `default` and `narrator` are the engine's own two exceptions.
- **There is no `formatVersion`**, deliberately — every manifest that exists is one we generate. The trigger
  to add one back is the first compatibility break (the likeliest being the `sprites`→`poses` rename in
  `.scratch/sprite-pose-split/`), and whichever change makes that break adds the field with it.

### Renderer contract
- `Renderer` interface in `src/Renderer.ts` is minimal: `render(animate)`, `loadStory(state, animate)`, `onRenderCallbacks`, `onFinishedCallbacks`, `loadAssets(state?)`.
- **Starting a story is `loadStory(state, animate)`, and nothing boots itself.** It swaps the story into the player and renders in one synchronous step; the auto-advance in `render` then walks to the first stop, painting every frame. Those two steps must not be separated by an `await` — `render` bumps `renderGeneration`, and that bump is the only thing that stops a pass still in flight from auto-advancing the story that replaced it. A bare `player.loadState` followed by an awaited asset load is exactly the bug this replaced. `animate` is the caller's choice: the player passes `true` so an intro or title screen plays out, the editor passes `false` so reloading a script lands on the first stop without replaying the opening.
- `DomRenderer` owns: input handling, menu orchestration, skip/auto, localStorage save, asset loading, render loop, scaling on fullscreen. It's ~340 lines and growing — candidates for extraction if you touch it.
- Sub-renderers receive `animate: boolean`. When `animate` is false, they must jump straight to end-state, which means removing listeners and cancelling in-flight transitions (most use `cloneNode()` to drop listeners — follow that pattern).
- Sub-renderers read prev state via `renderer.getCommittedState()`. `DomRenderer.committedState` is set synchronously **before** the `Promise.all(...).then()` runs, so reads inside scheduled microtasks see the *new* state. Always capture `prev` synchronously at the top of a sub-renderer's `render`.
- Renders can overlap: a rapid click triggers `render(false)` while an animated render's promises are still pending. `DomRenderer.render` stamps each pass with `renderGeneration` and the completion callback bails if superseded — completion side effects (`finished = true`, auto-advance) must stay behind that guard, since sprite `transitionend` promises can resolve long after their render was replaced.
- **The generation guard only shows its worth while the story is still moving.** Once the player is parked on a stop, a stale auto-advance is a no-op anyway, so most overlapping-render scenarios pass with the guard deleted — including the two sprite cases in `test/browser/DomRendererRapidClick.test.ts`, which were cited here as its regression net and are not. **The real net is the demo suite**: delete the guard and five of its decision tests fail, because the decision click's effect is lost and the story stays on the prompt. Reaching that window through clicks needs a scene's worth of animations still pending underneath, which is why it takes the demo story to do it. Nothing in the fast gate covers it, and an attempt at a fast-gate test was dropped rather than kept: every reproduction small enough for that suite — a click during a sprite walk, `advanceFast` over it, a decision click on a minimal branching story, two overlapping renders mid-flight — behaves the same with the guard deleted, and the only version that failed had to induce the overlap in a way no caller does. **If you rewrite the render loop, run `test:demo`** — `npm test` will not tell you that guard is gone.

### Save/load
- `VnGlobalSaveData` contains `seenCommands` (interval-encoded integer set) + `saves[]`. `seenCommands` is intentionally **global and mutable** — once a command is seen, it stays seen across undo, save slots, and replays. This is standard VN behavior: skip-mode only fast-forwards through text the player has already read. It lives on `VnPlayerState` for convenience but is not part of the immutable snapshot contract; don't try to "fix" it without a real reason.
- Save slots are `{ timestamp, path: number[] }` where `path` is `[...decisions, remainingAdvances]`.
- Persisted via `saveToLocalStorage(id, data)` under key `vn-<id>`. Currently `id` is hardcoded `"test"` — TODOed to be derived from VN title.
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
the current code, so do not read it as describing what exists.
- [PROJECT_STORAGE.md](./design-docs/PROJECT_STORAGE.md) — how an author's project (script, assets, metadata) is
  stored while editing and how it leaves the browser: OPFS as the working copy, a `.webvn.zip` archive as the
  canonical artifact, a library of projects rather than one, and four ingestion paths sharing one back half
  behind a `SourceLoader`. Read it before touching the asset loaders, the hardcoded asset lists in
  `src/demoStory.ts`, or the `vn-test` save key.
- [SCRIPT_INCLUDES.md](./design-docs/SCRIPT_INCLUDES.md) — splitting a story across YAML files with an
  `include` directive, resolved at parse time rather than as a command. Read it before changing
  `SourceLocation`, `storyToCommands`, `updateLabels`, or the editor's single-buffer assumptions.
- [EDITOR.md](./design-docs/EDITOR.md) — autocompletion, command documentation, list continuation and
  find-in-file for the script editor, and the CodeMirror 6 migration under them (5.x was archived in April
  2026). Read it before touching `src/editor/`, the command registry, or the `codemirror` dependency.

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

- **Add a new command (e.g. `wait`, `setVar`)**: create `src/core/commands/<area>/YourCommand.ts`, define a Zod schema, subclass `Command`, call `registerCommandHandler`. Then add a side-effect import in `src/core/player.ts`. Add an example line to the demo YAML in `src/demoStory.ts`, which both entry points load, and extend `test/demo/DemoStory.test.ts` to cover it.
- **Add a new background transition**: create in `src/domRenderer/bgTransitions/`, call `registerTransition(name, factory, optionsSchema)`. The schema is wired into the `bg` command's options automatically.
- **Add a new renderer sub-component**: follow `SpriteRenderer` / `BackgroundRenderer` — constructor takes `vnRoot`, `renderer`, optional asset loader; `render(state, animate)` returns a Promise that resolves when animations complete. Be careful with the `animate=false` path (drop listeners, cancel transitions).
- **Change the save format**: bump/validate in `loadFromLocalStorage`; keep an eye on `toShorthandPath` and `fromShorthandPath` — those two plus `ConsecutiveIntegerSet.toJSON/fromJSON` define what persists.
- **Add tests**: the directory a test sits in is what picks its vitest project — `test/unit/` (node), `test/browser/` (real Chromium — CSS transitions/animations actually fire, so render promises resolve like in production), `test/demo/` (whole-story playthroughs, which only `npm run test:demo` runs). Nothing keys off the filename, so a browser test misfiled under `test/unit/` runs in node and dies on a missing `document`. Put a test in the demo project only if it needs to walk a long stretch of a story — anything narrower belongs in `browser` so it stays in the fast gate. Start from `test/helpers/vnHarness.ts`: `startVn(script)` parses a YAML story, mounts a `DomRenderer` into a fresh root and resolves at the first stop, `nextStop(renderer, player)` waits for the next one, and `textBoxText`/`spriteElems`/`liveSprites`/`decisionItems` read the result out of the DOM. Node-side suites build commands through `test/helpers/commands.ts` instead. `ConsecutiveIntegerSet`, `VnPath` and the core state machine are covered; `test/browser/DomRenderer.test.ts` is the smoke test for the DOM render path; `test/demo/DemoStory.test.ts` covers the demo end to end. Sub-renderer promises must resolve even when there is nothing to animate, or the render loop stalls (see the empty-children guard in `DecisionRenderer.render`).

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

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. Neither exists yet; `/domain-modeling` creates them lazily. See [docs/agents/domain.md](./docs/agents/domain.md).
