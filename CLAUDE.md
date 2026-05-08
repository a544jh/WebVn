# CLAUDE.md

Notes for Claude Code (and other agents) working in this repo. Derived from a repo-wide review; keep in sync when the architecture shifts.

## What this is
A client-side visual novel engine + authoring tool. TypeScript, webpack. The "real" renderer uses direct DOM + Canvas2D APIs (no UI framework). Script language is YAML, parsed by the `yaml` lib. Commands self-register via side-effect imports.

Two entry points:
- `src/index.ts` → editor + live-preview player (demo/authoring)
- `src/playerIndex.ts` → standalone player, can load a script from `?vn=<base64 gzip YAML>`

## Commands
- `yarn` — install
- `yarn dev` — webpack-dev-server
- `yarn build` — production build
- `yarn lint` — ESLint over `**/*.ts`
- `yarn prettier` — prettier check
- `yarn test` — **currently a stub** (`echo Error: no test specified && exit 1`). No test runner is configured.

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

### Save/load
- `VnGlobalSaveData` contains `seenCommands` (interval-encoded integer set) + `saves[]`.
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

- **Add a new command (e.g. `wait`, `setVar`)**: create `src/core/commands/<area>/YourCommand.ts`, define a Zod schema, subclass `Command`, call `registerCommandHandler`. Then add a side-effect import in `src/core/player.ts`. Add an example line to the demo YAML in `src/index.ts` and `src/playerIndex.ts`.
- **Add a new background transition**: create in `src/domRenderer/bgTransitions/`, call `registerTransition(name, factory, optionsSchema)`. The schema is wired into the `bg` command's options automatically.
- **Add a new renderer sub-component**: follow `SpriteRenderer` / `BackgroundRenderer` — constructor takes `vnRoot`, `renderer`, optional asset loader; `render(state, animate)` returns a Promise that resolves when animations complete. Be careful with the `animate=false` path (drop listeners, cancel transitions).
- **Change the save format**: bump/validate in `loadFromLocalStorage`; keep an eye on `toShorthandPath` and `fromShorthandPath` — those two plus `ConsecutiveIntegerSet.toJSON/fromJSON` define what persists.
- **Add tests**: none exist. The pure-logic modules most worth covering first are `ConsecutiveIntegerSet`, `VnPath` (especially `undo` and `toShorthandPath`), `parseBooleanExpression`, and `State.fromShorthandPath`.

## Build tooling caveats
- `webpack-dev-server` is pinned at `^3.11.2` while `webpack` is `^5.88.2`. The v3 dev-server config shape (`inline`, `stats`) still works but upgrading to v4 is due.
- `@types/react` and `@types/yaml` are in `dependencies` but should be `devDependencies`.
- `tsconfig.json` targets `es6` / `module: es6`. `allowJs: true` is needed for `pegjsParser/parserWrapper.js` only.
- `yaml` is pinned at `2.0.0-4` (a pre-release). `YamlParser.ts:84-90` has an explicit `any` hack to copy the internal `Symbol.for("yaml.node.type")` off an alias source — the first TODO item is upgrading this lib.
