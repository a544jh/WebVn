# Asset ids and metadata for audio and backgrounds

Status: needs-triage

The manifest becomes a symbol table for audio and backgrounds, the way `../sprites/` makes it one for
an actor's images. The script names ids; the manifest maps them to files and carries metadata the
renderer can show. Filed 2026-08-28 out of the conversation that refined `../sprites/`; the shape is
agreed, three questions are not, which is why this is `needs-triage` where that ticket is
`ready-for-agent`.

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
`../asset-manifest/issues/03-undeclared-assets-are-parse-errors.md`, which is arguing about how to
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
`Record<string, string>` if question 2 goes the obvious way.

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

The difference: `../sprites/` was worked to an empty frontier and is `ready-for-agent`. This one has
three open questions below, and should be refined before an agent takes it.

## Open questions

**1. `bgm: stop` collides with the id namespace.** `Bgm.ts` does `if (audio === "stop") audio = null`,
so a track keyed `stop` would be unreachable. Either reserve `stop` as an id in the schema (cheap, no
format churn, one more rule to remember) or move stopping to `bgm: { stop: true }` (cleaner, breaks
every script that stops music - including the demo, twice). Leaning reserve.

**2. Do backgrounds get keyed at all, or only audio?** `bg`'s `image` is already overloaded between a
filename and a colour literal, discriminated by `state.image.charAt(0) === "#"` in three places in
`BackgroundRenderer`. Keying makes it id-or-colour, which is the same test plus a schema rule that an
id may not start with `#`. Consistency argues yes; the alternative leaves the file with two
conventions, audio keyed and backgrounds a bare path list. Leaning yes.

Optional cleanup if it goes ahead: the three copies of the `#` test want to be one predicate, since
that is the definition of "this is a colour, not an asset" and it is currently stated three times.

**3. Closed metadata set, or open bag?** Zod strips unknown keys, so an author writing `artistt:` gets
silence and a missing artist. `.strict()` on the asset entry turns that into a parse error, but cuts
against the forward-compatibility argument ticket 02 made for the top level ("a file carrying
`formatVersion: 1` still parses clean"). Probably strict on entries and lenient at the top, since the
reasons differ - a top-level key is how a later format announces itself, an unknown key inside an
asset entry is just a typo. Needs deciding, not assuming.

Adjacent, cheaper: allow `bigthump: sfx/bigthump.ogg` - a bare string - as shorthand for
`{ file: ... }`, since most sfx want no metadata. Costs a union in the schema and saves a line per
asset.

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
