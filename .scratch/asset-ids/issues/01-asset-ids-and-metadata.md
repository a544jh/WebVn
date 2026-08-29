# Asset ids and metadata for audio and backgrounds

Status: done

The manifest becomes a symbol table for audio and backgrounds, the way `../sprites/` makes it one for
an actor's images. The script names ids; the manifest maps them to files and carries metadata the
renderer can show. Filed and refined 2026-08-28. The four questions it carried are answered
below; the frontier is empty.

Unblocked - the asset manifest (`../asset-manifest/`, TODO item D) landed in
[#35](https://github.com/a544jh/WebVn/pull/35).

## The shape

```yaml
audioAssets:
  daylight:
    file: bgm/dayl_preview.ogg
    title: Daylight - 8bit remix
    artist: a544jh
  bigthump:
    file: sfx/bigthump.ogg

backgrounds:
  classroom: a.png
  hallway: b.png
```

```yaml
story:
  - bgm: daylight
  - sfx: bigthump
  - bg: { image: classroom, transition: fade, duration: 200 }
```

## Why: the manifest declares assets it does not actually index

`state.backgrounds` and `state.audioAssets` are read in exactly one place - `DomRenderer.loadAssets`
(`DomRenderer.ts:405` and `:410`) - to preload. Nothing else consults either list. The script names
files, and the renderers concatenate a directory prefix onto whatever it said:
`getAsset("audio/" + state.bgm)`, `getAsset("backgrounds/" + state.image)`.

**A correction to what `../asset-manifest/issues/02-manifest-yaml.md` recorded.** Its deferred section
says an undeclared asset is "a render-time miss, not a refusal". It is stronger than that - both
renderers *throw*:

- `AudioRenderer.ts:17` and `:28` - `throw new Error("Could not play audio " + state.sfx)`
- `BackgroundRenderer.ts:78`, `:129`, `:161` - ``throw new Error(`Could not load ${state.image}`)``

An undeclared asset takes the render down rather than quietly rendering nothing. That matters to
`../asset-manifest/issues/03-undeclared-references.md`, which is arguing about how to
report something that is already fatal.

What ids buy, beyond tidiness:

- renaming a file stops being a rewrite of the script
- `AssetResolver` (TODO item E) gets something to indirect through - indirection needs a name, and
  seven call sites concatenating paths have none
- ticket 03 becomes exact for these two: an unknown id is decidable at parse time
- metadata gets somewhere to live, which is what the pause menu needs

## Metadata and the pause menu

`PauseMenu.ts` builds Return / Save / Load. A now-playing line needs the current bgm id and the
manifest entry for it, and both are already in reach: `seedState` copies `audioAssets` into the state,
so `renderer.getCommittedState()` has the record. No new plumbing, no manifest reference held at
render time.

`VnPlayerState.audioAssets` changes from `string[]` to `Record<string, AudioAsset>`, where
`AudioAsset` is `{ file: string; title?: string; artist?: string }`. `backgrounds` becomes
`Record<string, string>` alongside it.

## How this ties to `../sprites/`

They are the same move - a declaration list becoming a keyed map - applied to the other three asset
kinds. Four things follow from that:

1. **They are one format version.** Both break the format, and
   `../asset-manifest/issues/02-manifest-yaml.md` says `formatVersion` comes back with the first
   break. Landing them separately means the first ticket adds the field and the second bumps it, so
   an author migrates twice for one conceptual change. **Recommend landing both under one version
   bump**, in either order, rather than sequencing them apart.
2. **Both unblock item E.** `AssetResolver` is indirection with nothing to indirect until assets have
   names.
3. **Both feed ticket 03, but not equally.** Audio ids, background ids and sprite *names* are all
   declared in the manifest, so a typo is a parse error. Sprite *ids* are invented in the script and
   can never be validated - `../sprites/` decides those stay runtime errors. So 03 covers three of
   the four kinds, and the editor has to cover the fourth.
4. **Both go ahead of the storage chain.** URL import, zip export and the OPFS store all read and
   write the manifest; changing its shape after those exist means migrating a format that has
   escaped. Recorded in `TODO`.

**`formatVersion` semantics are settled here, for both tickets.** `../sprites/` says it "adds the
field and the version gate"; what the gate *does* is decided below, and applies whichever of the two
lands first.

## Decisions

**1. `stop` is a reserved audio id.** `Bgm.ts` does `if (audio === "stop") audio = null`, so a track
keyed `stop` would be unreachable. The schema rejects `stop` as an audio asset id, and `bgm: stop`
keeps meaning what it means today.

Considered: `bgm: null` and `bgm: { stop: true }`. Both are cleaner - no reserved word, no collision
possible - and both break every script that stops music, the demo twice. Not worth it for a word
nobody will name a track. The cost is one arbitrary rule, and a genuinely-titled track called "stop"
is unspellable; it can have any id and a `title:` of "stop".

**2. Backgrounds are keyed too.** `backgrounds: { classroom: a.png }`, and `bg`'s `image` takes an id.
The colour overload survives unchanged - `state.image.charAt(0) === "#"` still means "this is a
colour, not an asset" - plus a schema rule that a background id may not start with `#`. Audio keyed
and backgrounds left a bare path list would have put two conventions in one file.

Cleanup that comes with it: the three copies of the `#` test in `BackgroundRenderer` (`:74`, `:125`,
`:156`) become one predicate, since that test *is* the definition of the id-or-colour split and it is
currently stated three times.

**3. Strict on asset entries, lenient at the top level.** An unknown key inside an asset entry is a
parse error, because it is a typo - `artistt: a544jh` should not silently produce a track with no
artist. An unknown key at the manifest's top level is still stripped, because that is how a later
format announces itself, which is the argument
`../asset-manifest/issues/02-manifest-yaml.md` made and it still holds *there*. The two rules differ
because the two situations differ.

**4. `formatVersion: 1` is required; a manifest without it is a parse error.** The manifest shipped in
[#35](https://github.com/a544jh/WebVn/pull/35) has no version field, so those files are v0. A v1
parser meeting one fails with a message naming the change rather than reading an array-shaped
`sprites` as a map and failing later with a confusing shape error.

This costs nothing today: the only v0 manifest in existence is the demo's, regenerated from source on
every master push. Check the version **before** the rest of the schema, so a version error is not
buried under twenty shape errors caused by it.

**Adjacent, decided with it:** a bare string is shorthand for `{ file: ... }`, so
`bigthump: sfx/bigthump.ogg` works and metadata is opt-in. This makes an audio entry with no metadata
read exactly like a background entry, which is the consistency that made keying backgrounds worth
doing in the first place.

**Asset ids carry no charset rule** - any non-empty string, minus the two reserved values above.
Unlike the project id, nothing derives a filename or a directory name from an asset id, so the
filesystem-safety reasoning behind `^[a-z0-9][a-z0-9_-]{0,63}$` does not transfer. Inventing a
restriction without a reason to enforce it would only cost authors.

## Implementation notes

- `VnPlayerState.audioAssets` becomes `Record<string, AudioAsset>` and `backgrounds` becomes
  `Record<string, string>`. `DomRenderer.loadAssets` (`:405`, `:410`) iterates values rather than the
  list.
- `animatableState.audio.bgm` holds an **id** rather than a filename after this, which is what lets
  the pause menu look up a title. `AudioRenderer` and `BackgroundRenderer` resolve id to file through
  the state they already receive.
- **Saves are unaffected.** A save stores a `VnPath` - the actions taken - not `animatableState`, so
  nothing persisted contains a filename or an id. Worth confirming during implementation, but the
  same reasoning that answered this for `../sprites/` applies.
- The demo's `test-assets/manifest.yaml` and `script.yaml` both change. Keep the rewrite line-for-line
  in `script.yaml`: `test/demo/DemoStory.test.ts` asserts errors at L97, L118 and L121, and adding or
  removing a line breaks it. That test caught exactly this in #35.

## Not in scope

- **An actor's sprites.** `../sprites/`, which does the same thing to `Actor.sprites`.
- **`AssetResolver` itself.** Item E. This gives it names to resolve; it does not do the resolving.
- **Undeclared assets as parse errors.** `../asset-manifest/issues/03`. This makes that ticket easier
  to state, and does not pre-empt it.
- **What else the pause menu shows.** A now-playing line is the requirement metadata exists for.
  Volume, settings and the rest are their own work.

## See also

- `../sprites/issues/01-sprite-ids-and-declared-sprites.md` - the other half of the format change
- `../asset-manifest/issues/02-manifest-yaml.md` - the `formatVersion` trigger, and the manifest schema
  this extends
- `design-docs/PROJECT_STORAGE.md` - the storage chain this precedes
- `src/core/commands/audio/Bgm.ts`, `src/core/commands/audio/Sfx.ts`,
  `src/core/commands/backgrounds/Background.ts`, `src/domRenderer/AudioRenderer.ts`,
  `src/domRenderer/BackgroundRenderer.ts`, `src/domRenderer/menus/PauseMenu.ts`

## Comments

### 2026-08-28 - refined; all four questions closed

Worked to an empty frontier in the session that filed it. The three questions the ticket shipped with
are answered above, and settling them surfaced a fourth that neither this ticket nor `../sprites/`
had: both said `formatVersion` comes back, neither said what the gate *does* when it meets a manifest
that predates it. Decided here for both, since they land together.

Two smaller things were decided rather than left for the implementing agent, because both are the kind
of gap that stalls one mid-task: whether a bare string works as an audio entry (it does), and whether
asset ids inherit the project id's charset rule (they do not - nothing derives a filename from them).

### 2026-08-28 - done, landed with `../sprites/` under formatVersion 1

Implemented together with `../sprites/issues/01-sprite-ids-and-declared-sprites.md`, as the tie-in
section above asked for: one format change, one version bump, one migration for an author.

What landed, against what was decided here:

- `VnPlayerState.audioAssets` is `Record<string, AudioAsset>` and `backgrounds` is
  `Record<string, string>`; `seedState` copies both. A bare string is shorthand for `{ file }`.
- `formatVersion: 1` is required and checked **before** the rest of the schema, on its own - a v0
  manifest fails one error naming the change rather than a shape error per declaration.
- `stop` is rejected as an audio id; a background id may not start with `#`.
- Strict inside an asset entry, lenient at the top level.
- The pause menu shows a now-playing title and artist, read out of the committed state - no manifest
  reference held at render time. A track with no title shows nothing rather than its id: an id is a
  name for the author.
- The three copies of the `#` test in `BackgroundRenderer` are one predicate, `isBackgroundColor`,
  and the three renderable-construction sites are one `makeRenderable` differing only in duration.

Two things worth recording that the ticket did not decide:

- **`src/domRenderer/assetPaths.ts` is where an id becomes a path.** Both the sub-renderers and
  `DomRenderer.loadAssets` go through it, so what is preloaded and what is asked for cannot drift.
  That is the seam TODO item E slots into; it is not item E, which is still the interface behind it.
- **The sub-renderers take the declarations as an argument.** `AudioRenderer.render(audio, assets)`,
  `BackgroundRenderer.render(bg, backgrounds, animate)`, `SpriteRenderer.render(sprites, actors,
  animate)`. This ticket said they would "resolve id to file through the state they already
  receive"; they receive a slice of `animatableState`, which carries no declarations, so the
  declarations are passed beside it rather than the whole state - a narrower dependency than
  handing each sub-renderer a `VnPlayerState`.

Confirmed as expected: **saves are unaffected.** A save stores a `VnPath`, so nothing persisted
holds a filename or an id, and the save tests needed no change.

### 2026-08-28 - review pass

A two-axis review of the commit found one thing both axes flagged, and it was real:

- **`DomRenderer.loadAssets` was not going through `assetPaths.ts`** for backgrounds and audio - it
  re-spelled `"backgrounds/"` and `"audio/"` inline, so the module was the single definition for
  exactly one of the three asset kinds while a comment and `CLAUDE.md` both claimed otherwise. Fixed
  by splitting each resolver in two: `xFilePath(file)` for preloading, which already has filenames,
  and `xAssetPath(declarations, id)` for rendering, defined in terms of it.

Two consolidations that followed from the same reading:

- **`stop` and the leading `#` moved to `src/core/state.ts`** as `STOP_AUDIO_ID` and
  `isBackgroundColor`. Both are engine-level facts that `Bgm.apply` and `BackgroundRenderer` act on
  and the schema rejects, so each was being stated in two layers that cannot share.
- **An actor entry is strict too.** Decision 3 scoped strictness to asset entries, and an actor is
  not one - but `../sprites/` put `sprites` inside it, which is what made it an entry that declares
  assets. A stripped `sprits:` leaves an actor silently declaring no sprites, which is the failure
  decision 3 names. Applying the rule to a shape this change created, rather than widening it.
