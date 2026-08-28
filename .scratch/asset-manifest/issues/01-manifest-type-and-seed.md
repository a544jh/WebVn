# Manifest type and seed, and the parser signature

Status: done

Step 1 of `../spec.md`. Types only - no new file format, no Zod, no YAML. Four pieces, one commit
each; they are not independently shippable, so they land together.

## 1. `src/core/manifest.ts`

New module holding `VnManifest` and `seedState(manifest?: VnManifest): VnPlayerState`.

`seedState` supplies the engine defaults - the default actor (white text and name tag) and the
empty narrator - and merges the manifest's `actors` over both. It mints a fresh
`ConsecutiveIntegerSet` on every call. With no argument it seeds an empty manifest.

Step 2 puts the Zod schema and `manifest.yaml` loading in this same file, which is why it is its own
module rather than living in `state.ts` (which would then need a YAML dependency).

## 2. Parser signature

`VnParser.updateState(text, state)` becomes `parseStory(text, manifest)`, returning
`[VnPlayerState, ParserError[]]` as before. The interface in `src/core/commands/Parser.ts:54` stays -
it is the editor's injection seam - with the method renamed.

Delete the `baseState` comment at the top of `src/yamlParser/YamlParser.ts`: the parameter type now
says what it was saying.

Call sites: `src/editor/editor.ts:78` (its `baseState` field becomes `manifest`, and its comment
goes too), `src/playerIndex.ts:44` (currently passes the live `player.state` - the latent bug this
change removes).

## 3. Furniture

- Delete `initialState` from `src/core/player.ts`. `seedState()` replaces it.
- Delete `freshState` from `test/helpers/vnHarness.ts`. It existed only to work around
  `initialState.seenCommands` being one shared mutable instance; every `seedState` call is already
  fresh. Its removal is the evidence the fix landed.
- `src/demoStory.ts` exports `demoManifest` and `demoYaml`, no state.
- `VnPlayer` keeps taking a `VnPlayerState`. Entry points become
  `new VnPlayer(seedState(demoManifest), save)`. The ~30 `new VnPlayer(...)` sites in
  `test/unit/state.test.ts` do not move; `makeState` there becomes
  `updateLabels({ ...seedState(), commands })`.
- `VnPlayer.loadState` and `reloadStory` copy `this.state.seenCommands` onto the incoming state.
  This is load-bearing: the seed breaks the object-identity chain that carried seen-marks across a
  reparse today.
- Add a `Manifest` entry to `CONTEXT.md` under Authoring.

## 4. `test/unit/seenCommands.test.ts`

The behaviour at risk, and untested today - `reloadStory` has no coverage at all, since nothing
mounts `VnEditor` (TODO item T). The demo suite's assertions at `test/demo/DemoStory.test.ts:879`
exercise the constructor path from localStorage, not reparse.

Needs no DOM or editor:

- seen-marks survive a reparse: build a player from `seedState(m)`, advance a few stops,
  `player.reloadStory(parseStory(script, m))`, assert the marks are still there
- a fresh player on the same manifest starts with an empty set - this fails if `seedState` ever goes
  back to sharing one instance

## Done when

`npm run typecheck`, `npm test` and `npm run test:demo` pass, `freshState` is gone, and nothing
outside `manifest.ts` constructs a starting state.

## Comments

**2026-08-28** - Implemented in [#34](https://github.com/a544jh/WebVn/pull/34), four commits.
`freshState` is gone, nothing outside `manifest.ts` constructs a starting state, and typecheck,
lint, prettier, `npm test`, `npm run test:demo` and the build all pass.

Two departures from the text above, both deliberate:

- `VnManifest.actors` is `Record<string, Actor>`, not the `Actors` in `../spec.md`. `Actors` makes
  `default` and `narrator` required, which contradicts a manifest not having to declare either.
- `seedState` merges the default actor field by field, so a project can override just its text
  colour; every other entry, the narrator included, replaces whatever the engine had.

One thing the ticket did not anticipate: the parser mutated `newState.commands`, which compiled only
because a spread drops `readonly`. A seed does not, so it builds a new object instead.
