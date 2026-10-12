# 07: Music and sound effects, apart

Status: needs-triage

Blocked by: a grilling. Nothing in code blocks it, but the questions below are open, and the canvas
the spec links is binding for pixels, so the decisions have to be drawn before anything is built.

## What this is

Raised by the maintainer 2026-10-12: **the panel should group music and sound effects separately,
even though the engine does not care about the difference.** Today the Audio group lists every
`audioAssets` id together. `bgm:` and `sfx:` resolve ids out of that one map, and a track is music or
an effect only by which command names it.

## Why

- A project gathers far more effects than tracks, and the tracks are what an author looks for when
  scoring a scene. One flat Audio group buries them.
- The demo already keeps them apart on disk, in `assets/audio/bgm/` and `assets/audio/sfx/`, so the
  distinction is one authors are already making by hand.
- Add asset does not follow that layout. It writes audio loose into `assets/audio/<file>`, so an
  author following the demo has to type `bgm/` into the File name field themselves.

## Recommended: by folder

Music is what is declared under `assets/audio/bgm/`, and sound effects are what is declared under
`assets/audio/sfx/`. This is the recommendation the maintainer was given, and is what to grill first.

- **It needs only the manifest.** The folder is part of each declared path, so the panel stays a view
  of the manifest (spec point 1), and `locateAsset` in `assetPaths.ts` already reads the layout
  backwards for undeclared files.
- **It is stable.** A row moves only when its declaration does, never when the script changes.
- **It matches the demo**, and Add asset can match it too: its Kind offers Music and Sound effect for a
  sound instead of Audio alone, and writes into the folder the choice names.
- **The engine stays out of it.** Nothing in the format changes, no `formatVersion` bump, and a track
  in the "wrong" folder still plays under either command.

## Rejected so far, for the grilling to confirm

- **By how the script uses each id** (`bgm:` or `sfx:`). Rows would jump as the author types, an id
  not used yet has no home, and an id used both ways has two.
- **Splitting `audioAssets` in the manifest** into two maps. That is a format change, and it makes the
  engine care about a distinction the maintainer said it should not.

## Open questions

1. **Where audio outside both folders goes.** The option given so far: keep Audio as the group, with
   Music and Sound effects nested under it the way sprites sit under an actor, and loose files
   directly under Audio. The alternative is three top-level groups, with a loose file in a third one.
2. **The folder names.** `bgm/` and `sfx/` are the demo's and match the two commands. They are not
   words an author reads anywhere else, though, and the panel would show Music and Sound effects
   over them.
3. **Whether `assetPaths.ts` spells the two subfolders.** It is the one place a path is built, so if
   Add asset writes into them, the prefixes belong there and nowhere else. That makes a convention
   look like part of the layout, which it is not: a file anywhere under `audio/` still works.
4. **Add asset's Kind for a sound.** Two options (Music, Sound effect), or Audio plus a second select.
   It is a single disabled option today (ticket 02's 2026-10-12 amendment).
5. **The counts.** Under nesting, does Audio count every declaration under it, as Actors does?
6. **Declare and undeclared files** under `bgm/` and `sfx/`: they need to land in the nested branch
   their folder names, which `undeclaredFiles.ts` does not do for audio today.
7. **Title and artist.** The pause menu credits only the playing `bgm`. Should the panel show them on
   music rows, or offer them in Add asset when the kind is Music?

## Comments
