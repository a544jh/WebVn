# Asset manifest: a project declares its own assets

TODO item D. A project cannot declare its own assets today: `actors`, `backgrounds` and
`audioAssets` live in `src/demoStory.ts` as a hardcoded `VnPlayerState` and reach the parser through
`baseState`. The YAML supplies the story; everything else is a TypeScript constant compiled into the
bundle.

Design: `design-docs/PROJECT_STORAGE.md`, "Prerequisite: assets have to become project data".
Decision: `docs/adr/0001-manifest-seeds-the-initial-state.md`.

## The shape

A `VnManifest` holds what a project declares:

```ts
interface VnManifest {
  readonly actors: Actors
  readonly backgrounds: string[]
  readonly audioAssets: string[]
}
```

It is an *input*, not a live field. `seedState(manifest)` copies it into a starting
`VnPlayerState`, which then carries `actors`/`backgrounds`/`audioAssets` exactly as it does now, so
`Say.apply` and `DomRenderer.loadAssets` are untouched.

The parser takes the manifest rather than a state:

```ts
parseStory(text: string, manifest: VnManifest): [VnPlayerState, ParserError[]]
```

That is the point of the whole change. `updateState(text, baseState)` accepts any state, and a
mid-story one yields a story claiming to start in the middle - prevented today only by comments in
`YamlParser.ts` and `VnEditor`. With a manifest parameter the mistake cannot be typed.

Story and playback stay fused in `VnPlayerState`. See the ADR for why.

## Engine defaults

`seedState` supplies the default actor and the narrator; a manifest's `actors` merge over both. So a
manifest need not declare either, matching the example in `PROJECT_STORAGE.md`, and "every actor
inherits from the default actor" stays true without every project restating it. The demo manifest
then declares only the narrator's colour override and its two actors.

## Two steps

1. **Type and seed** - `issues/01-manifest-type-and-seed.md`. No new file format. Closes the
   parser footgun and is independently shippable.
2. **`manifest.yaml`** - `issues/02-manifest-yaml.md`. Zod schema, the two-document YAML stream for
   the URL payload, project identity fields.

`AssetResolver` (TODO item E) is separate and unaffected.

## Not in scope

- Moving `seenCommands` off `VnPlayerState`. Adjacent, deliberately deferred - see the ADR's
  consequences.
- `DomRenderer.loadAssets` taking a manifest instead of a state. Revisit with `AssetResolver`,
  which reworks asset plumbing anyway.
- Splitting story from playback. Explicitly rejected in the ADR.
