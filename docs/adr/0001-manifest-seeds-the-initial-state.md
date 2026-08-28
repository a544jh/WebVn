# The manifest seeds the initial state; story and playback stay fused

`VnPlayerState` holds four things with different lifetimes: the manifest (`actors`,
`backgrounds`, `audioAssets`), the story (`commands`, `labels`), the playback position
(`commandIndex`, `animatableState`, `variables`, ...), and `seenCommands`. We are splitting the
manifest out into its own type, which seeds a starting state, and deliberately leaving story and
playback fused in one object.

## Why the manifest comes out

The parser is the one place the fusion causes real mistakes. `updateState(text, baseState)` accepts
any state, and passing a mid-story one produces a story that claims to begin in the middle. Today
that is prevented by prose - an eight-line comment in `YamlParser.ts` and a hand-maintained
`baseState` field in `VnEditor` with its own comment. It is not prevented by the types, and the two
entry points already disagree about what to pass: `index.ts` passes `demoState`, `playerIndex.ts`
passes the live `player.state`, which is safe only because nothing has advanced yet when it runs.

`parseStory(text, manifest)` makes the mistake unrepresentable. Both comments become unnecessary
rather than updated.

The manifest is also a genuinely clean boundary: not one of its fields changes while a story runs,
and nothing in playback points into it - commands look actors up by name and never write back.

## Why story and playback stay together

`commandIndex` is an index into `commands`. Splitting them puts the pointer in one object and the
thing it points into in another, to be kept matched by hand.

The engine is also "state in, state out" throughout: a command takes a state and returns one, and
replay is "start from a state, apply actions, end at a state". A split means every one of those
functions grows a second parameter and returns both halves, and every `Command.apply` changes shape.
`State.fromPath(startingState, path)` being two lines is a direct consequence of the fusion, and
commands read the story as well as the playhead - `Say.apply` peeks at `commands[commandIndex + 1]`
to decide whether to stop before a decision.

That cost would buy nothing the manifest split does not already buy, since the parser was the only
place the confusion did damage. The story/playback line is also not obvious yet: there is no clear
answer for where `variables` belongs, which usually means the boundary is not real.

## Considered and rejected

- **Full three-way split** (manifest / story / playback). Rejected for the reasons above: invasive
  through the replay core, no additional bug prevented.
- **Keeping the manifest as a live field on the state** (`state.manifest.actors`) rather than
  seeding. Rejected as churn at every read site for no gain - the footgun is closed by the parser's
  signature, not by where the fields live.

## Consequences

- `seenCommands` currently survives a reparse by accident: `demoState` spreads `initialState`, so
  they share one mutable `ConsecutiveIntegerSet`, and the parser spreading `baseState` carries that
  same object through. The seed breaks that chain, so `VnPlayer` has to carry the set across
  `loadState`/`reloadStory` explicitly. Behaviour is unchanged; the mechanism becomes visible.
- `seenCommands` stays a field on `VnPlayerState` so `State.advance` can keep writing to it. Moving
  it onto `VnPlayer` would mean advance reporting visited commands back to the player, which is a
  change to the replay core - the code this decision exists to leave alone. Filed separately.
- `freshState` in the test harness disappears. It existed only to undo the shared-set bug, so its
  removal is the evidence the fix landed.
- A function named `parseStory` returns a `VnPlayerState`. That is the same conflation relocated,
  and it is accepted: it is the smallest awkwardness available while story and playback are one type.

## Amendment, 2026-08-28: the manifest also carries identity

`.scratch/asset-manifest/issues/02-manifest-yaml.md` turns `manifest.yaml` into a real file, and with it
`VnManifest` gains `id` and `title`. `parseStory(text, manifest)` and `seedState(manifest)` therefore now
receive two fields neither will ever read, which widens the boundary this ADR drew.

The alternative was a `ProjectManifest` holding identity and wrapping an assets-only `VnManifest`, so the
parser's parameter stayed exactly what a story needs - the same move this ADR makes, one level further up.
It was rejected in favour of keeping everything in one place: one type, one schema, one thing to look at
when asking what a project declares.

Nothing above is retracted. The manifest is still an input rather than a live field, still unchanged while a
story runs, still nothing playback points into, and `parseStory` still cannot be handed a mid-story state -
which is the mistake this decision existed to make unrepresentable. What changed is the definition of the
contents: "everything a story needs that its script does not spell out" became "what a project declares
about itself", which is a superset. `CONTEXT.md` carries the wider wording.
