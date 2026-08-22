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
- `npm run lint` — ESLint over `**/*.ts`
- `npm run prettier` — prettier check
- `npm test` — the fast gate: vitest projects `unit` (node, `src/**/*.test.ts`) and `browser` (headless Chromium via Playwright, `src/**/*.browser.test.ts`). ~6s.
- `npm run test:demo` — the `demo` project (`src/**/*.demo.test.ts`): full playthroughs of the demo story in real Chromium, waiting on real transitions. ~32s, so it is deliberately **not** part of `npm test`. Run it when you touch the renderer, the commands, or `src/demoStory.ts`.
- `npm run test:all` — all three projects. `npm run test:unit` / `npm run test:browser` / `npm run test:demo` run one; `:headful` variants (`test:browser:headful`, `test:demo:headful`) show the browser; `npm run test:watch` watches the fast gate. Browser and demo tests need Playwright's Chromium installed (`npx playwright install chromium`).

## Top-level layout
```
src/
  core/            state, player, VnPath, save, commands/*  (no DOM imports)
  yamlParser/      YamlParser.ts — the parser actually used
  domRenderer/     DomRenderer + sub-renderers (textbox, sprite, bg, audio, decision, menus)
  reactRenderer/   incomplete React experiment — NOT wired up, do not rely on it
  pegjsParser/     earlier PEG.js grammar — NOT wired up
  editor/          CodeMirror editor
  assetLoaders/    image/audio preloaders
  lib/             ConsecutiveIntegerSet
experiments/       abandoned side tracks (elm, pixi, etc.) — shipped in repo, ignored by lint
test-assets/       runtime assets copied to dist/ by CopyPlugin
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

### Renderer contract
- `Renderer` interface in `src/Renderer.ts` is minimal: `render(animate)`, `onRenderCallbacks`, `onFinishedCallbacks`, `loadAssets()`.
- `DomRenderer` owns: input handling, menu orchestration, skip/auto, localStorage save, asset loading, render loop, scaling on fullscreen. It's ~340 lines and growing — candidates for extraction if you touch it.
- Sub-renderers receive `animate: boolean`. When `animate` is false, they must jump straight to end-state, which means removing listeners and cancelling in-flight transitions (most use `cloneNode()` to drop listeners — follow that pattern).
- Sub-renderers read prev state via `renderer.getCommittedState()`. `DomRenderer.committedState` is set synchronously **before** the `Promise.all(...).then()` runs, so reads inside scheduled microtasks see the *new* state. Always capture `prev` synchronously at the top of a sub-renderer's `render`.
- Renders can overlap: a rapid click triggers `render(false)` while an animated render's promises are still pending. `DomRenderer.render` stamps each pass with `renderGeneration` and the completion callback bails if superseded — completion side effects (`finished = true`, auto-advance) must stay behind that guard, since sprite `transitionend` promises can resolve long after their render was replaced (see `DomRendererRapidClick.browser.test.ts`).

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

- **Add a new command (e.g. `wait`, `setVar`)**: create `src/core/commands/<area>/YourCommand.ts`, define a Zod schema, subclass `Command`, call `registerCommandHandler`. Then add a side-effect import in `src/core/player.ts`. Add an example line to the demo YAML in `src/demoStory.ts`, which both entry points load, and extend `DemoStory.demo.test.ts` to cover it.
- **Add a new background transition**: create in `src/domRenderer/bgTransitions/`, call `registerTransition(name, factory, optionsSchema)`. The schema is wired into the `bg` command's options automatically.
- **Add a new renderer sub-component**: follow `SpriteRenderer` / `BackgroundRenderer` — constructor takes `vnRoot`, `renderer`, optional asset loader; `render(state, animate)` returns a Promise that resolves when animations complete. Be careful with the `animate=false` path (drop listeners, cancel transitions).
- **Change the save format**: bump/validate in `loadFromLocalStorage`; keep an eye on `toShorthandPath` and `fromShorthandPath` — those two plus `ConsecutiveIntegerSet.toJSON/fromJSON` define what persists.
- **Add tests**: unit tests (node) go in `src/**/*.test.ts`; browser tests in `src/**/*.browser.test.ts` (run in real Chromium — CSS transitions/animations actually fire, so render promises resolve like in production); whole-story playthroughs go in `src/**/*.demo.test.ts`, which only `npm run test:demo` runs. Put a test in the demo project only if it needs to walk a long stretch of a story — anything narrower belongs in `browser` so it stays in the fast gate. `ConsecutiveIntegerSet`, `VnPath` and the core state machine are covered; `DomRenderer.browser.test.ts` is the smoke test for the DOM render path — extend it (or follow its `nextStop` helper pattern) for renderer-level tests; `DemoStory.demo.test.ts` covers the demo end to end. Sub-renderer promises must resolve even when there is nothing to animate, or the render loop stalls (see the empty-children guard in `DecisionRenderer.render`).

## Build tooling caveats
- Package manager is **npm** (`package-lock.json`). Do not reintroduce `yarn.lock`; the two are not interchangeable here, see "Deferred upgrades" for why.
- `webpack-dev-server` is pinned at `^3.11.2` while `webpack` is `^5.88.2`. The v3 dev-server config shape (`inline`, `stats`) still works but upgrading to v4 is due. Nothing automated covers `npm run dev` — verify it by hand after touching webpack config.
- `@types/react` is in `dependencies` but should be `devDependencies`.
- `tsconfig.json` targets `es6` / `module: es6`. `allowJs: true` is needed for `pegjsParser/parserWrapper.js` only. `skipLibCheck` is not set, so a bare `tsc --noEmit` fails inside `node_modules`; use `npx tsc --noEmit --skipLibCheck`.
- The YAML lib is installed under an alias — `"yaml-vn": "npm:yaml@2.0.0-4"` — and `YamlParser.ts` imports from `"yaml-vn"`, not `"yaml"`. This is deliberate; see below.
- `zod` and `typescript` are held at exact versions. See below.

## Deferred upgrades

Switching from yarn to npm regenerated the lockfile, which pulls every dependency to the top of
its semver range. Three things are deliberately held back so that switch changed the package
manager and nothing else. Each is safe to do on its own, in its own session.

- **`yaml` — held at `2.0.0-4` via the `yaml-vn` alias.**
  vite 6+ declares `yaml: "^2.4.2"` as an *optional* peer dependency. npm enforces peer deps
  (yarn 1 ignored them entirely), so a root `yaml@2.0.0-4` makes npm refuse to hoist `vite`,
  which breaks `@vitest/browser` — every test file dies with `Cannot find package 'vite'`.
  Nesting a second yaml cannot fix it: peers resolve at or above the dependent's position, so a
  hoisted vite can only ever see a top-level `yaml`. Aliasing our copy out of the name `yaml`
  sidesteps the collision, and vite then has no yaml at all — fine, because the peer is optional
  and we use neither YAML config files nor `.yaml` imports.
  *To undo:* upgrade to `yaml@^2.9`, import from `"yaml"` again, drop the alias. The migration is
  ~15 lines, all in `updateState`: `Options` no longer exists (just delete `docOptions`);
  `Composer`/`Parser` went callback-based to generator-based
  (`Array.from(new Composer().compose(parser.parse(text)))`); and `Alias.source` is now the anchor
  *name* rather than the node, with a new `Alias.resolve(doc)` returning the node — which lets the
  `Symbol.for("yaml.node.type")` hack at `YamlParser.ts:84-90` be deleted outright. Everything
  else the file uses (the `isX` guards, `LineCounter`, `doc.get`, `node.range`) is unchanged in 2.9.

- **`zod` — pinned to exact `3.0.0`.**
  3.25 brands `ZodAny` with a `_any` property, so the concrete schemas every caller passes to
  `makeZodCmdHandler` stop being assignable: 9 compile errors across `Bgm`, `Sfx`, `Background`,
  `Decision`, `Label`, `Hide`, `Show`, `FreeformPos`, `Mode`.
  *To unpin:* change `ZodAny` to `ZodTypeAny` on `Parser.ts:1` and `Parser.ts:70`. That is the
  entire fix (verified), and it is the `ZodAny` item in ROUGH_EDGES. Type-only, no runtime effect.
  zod 4 is a separate and much larger migration.

- **`typescript` — pinned to exact `5.1.6`.**
  5.9's `lib.dom.d.ts` drops `ScreenOrientation.lock` (`index.ts:68`, `playerIndex.ts:63` — the
  duplicated fullscreen bootstrap) and makes TypedArrays generic over their backing buffer, which
  breaks `pipeThrough(new DecompressionStream("gzip"))` at `playerIndex.ts:53`.
  *To unpin:* augment `ScreenOrientation` — and add the `.catch()` it never had, since `lock()`
  rejects on desktop — then either cast at `playerIndex.ts:53` or drop `to-readable-stream` in
  favour of `new Response(bytes).body`.

Every other dependency did move to the top of its range during the switch, verified green: lint
(0 errors, 8 warnings), prettier (the same 6 unformatted files as before), `tsc --skipLibCheck`,
build, 83 unit+browser tests, 28 demo tests, and `npm run dev`.
