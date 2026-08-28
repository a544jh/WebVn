# Sprite ids, and sprites declared in the manifest

Status: ready-for-agent

Refined 2026-08-28 against Ren'Py's image model. This replaces the "split sprite into sprite / pose /
actor" ticket that used to live here - **the pose rename is rejected**, and the directory renamed from
`sprite-pose-split/` with it. What survives is the half that was never about vocabulary: `id` naming a
sprite, and an actor's sprites becoming declared names rather than filenames in the script.

Unblocked. Its one dependency, the asset manifest (`../asset-manifest/`, TODO item D), landed in
[#35](https://github.com/a544jh/WebVn/pull/35).

## The problem

Two defects, one cause. `ShowCommandSchema` (`src/core/commands/sprites/Show.ts`) accepts `id` and
`position` and `apply()` silently drops both:

```ts
const newSprites = { ...state.animatableState.sprites, [this.cmd.actor]: newSprite }
```

The sprite map is keyed by actor, so `id` has nowhere to go and an actor can be on screen exactly once,
permanently. That is the "Custom sprite IDs" line under Sprites in `TODO`.

Separately, the script names image files directly - `sprite: idle.png` - so a rename of a file is a
rewrite of the script, and `Actor.sprites?: string[]` is a list nothing consults. The manifest declares
those filenames but is only a preload index: `state.audioAssets` and `state.backgrounds` are read in
exactly one place, `DomRenderer.loadAssets`, and `Actor.sprites` in none.

## What Ren'Py does, since that is where the model comes from

Read from the documentation source in `renpy/renpy` (`sphinx/source/displaying_images.rst`,
`layeredimage.rst`), which is what renpy.org renders.

- **An image is declared, not referenced by path.** `image eileen happy = "eileen_happy.png"`. The
  script never names a file.
- **An image name is a tag plus attributes.** *"The first component of the image name is called the
  image tag. The second and later components of the name are the image attributes."*
- **The tag is the identity, and it is one-per-layer.** *"If an image with the same image tag is
  already showing on the layer, the new image replaces it."* That is our `sprites[actor]` exactly.
- **`as` overrides the tag.** *"The `as` property takes a name. This name is used in place of the image
  tag when the image is shown. This allows the same image to be on the screen twice."*
  `show mary night sad as mary2 at left`.
- **`hide` takes the tag.** *"The hide statement takes the image tag from the image name, and then
  hides any image on the layer with that tag."* One lookup, one form.

So `id` is Ren'Py's `as`, and hide-by-id is what Ren'Py already does. Our `Hide.apply` is `delete
newSprites[this.cmd]` - a key lookup - so it needs no change at all.

## The design

### 1. `id` names the sprite, defaulting to the actor

```yaml
- show:
    actor: Jenny
    sprite: happy        # id defaults to "Jenny"
- show:
    id: jenny-twin
    actor: Jenny
    sprite: sad
```

`Show.apply` keys by `this.cmd.id ?? this.cmd.actor` instead of `this.cmd.actor`. Every existing script
keeps working, because the default id is the key those scripts already write to.

### 2. `hide` takes a sprite id, and does not change

`hide: Jenny` removes the sprite whose id is `Jenny` - the default one. `hide: jenny-twin` removes the
custom one. These are the same operation, because default and custom ids share one namespace, so there
is no `hide: {id: ...}` form to add. **`HideCommandSchema` and `Hide.apply` are untouched**; only what
the string means changes.

Consequence, accepted: there is no way to hide every sprite of an actor at once. Enumerate the ids. If
that turns out to be wanted, it is a new command or a `hide: {actor: X}` form later, not a rider here.

### 3. An actor declares named sprites

```yaml
actors:
  Jenny:
    name: Jenny
    sprites:
      happy: jenny_happy.png
      sad: jenny_sad.png
```

`Actor.sprites` becomes `Record<string, string>` - name to filename - and `sprite: happy` resolves
through it. The script stops naming files, which is what makes the asset layer swappable and is the
prerequisite `AssetResolver` (TODO item E) was missing.

**This is a breaking format change**: `sprites: [idle.png]` becomes `sprites: {idle: idle.png}`. It is
the trigger `../asset-manifest/issues/02-manifest-yaml.md` names for bringing `formatVersion` back, so
this ticket adds the field and the version gate. The trigger's description there says the break will be
a `sprites`-to-`poses` rename; the rename is gone, the break is not.

What the gate *does* is decided in `../asset-ids/issues/01-asset-ids-and-metadata.md`: `formatVersion: 1`
is required, a manifest without it is a parse error, and the version is checked before the rest of the
schema so a version failure is not buried under the shape errors it causes. That holds for whichever of
the two tickets lands first - they are meant to land under one bump.

### 4. `Sprite` becomes `SpriteInstance`

The on-screen entry in `src/core/state.ts` is renamed, freeing "sprite" to mean the declared image in
both the manifest and the `show` command. 22 occurrences across three files (`state.ts`, `Show.ts`,
`SpriteRenderer.ts`).

`CONTEXT.md` calls the on-screen thing a *sprite* and has no term for the image, so both entries
change with this ticket rather than ahead of it: the glossary describes what is built, and a rename
that has been decided but not written is not built. Only the rejected *pose* entry left early, since
documenting a design we turned down is worse than documenting nothing.

## Rejected: the pose rename

Calling the declared image a *pose* and keeping `Sprite` for the on-screen thing is the other coherent
option, and it was the original plan here. Rejected because both vocabularies are internally consistent
and `sprite: happy` / `sprites: {happy: ...}` is a clean singular-plural pair, so there is nothing to
buy. Ren'Py uses neither word - its terms are *tag* and *attribute* - so there is no external
convention to defer to either.

Cost was not the deciding factor: both renames are about 22 occurrences in three files.

## Also rejected for now: attributes as a set

Ren'Py's attributes are a set with persistence and best-fit matching, not one flat name -
`show mary happy` keeps `night` from the showing `mary night sad`, and `-happy` removes an attribute.
`layeredimage` exists because flat naming does not scale: *"a character with 4 outfits, 4 hairstyles,
and 6 emotions already has 96 possible combinations."*

A flat `sprites: {happy: file}` map is the pre-`layeredimage` model, and it is what this ticket ships.
Deliberate: WebVn has no 96-combination characters and `formatVersion` will exist after this change, so
the upgrade path is open rather than closed off.

## Sprite ids are a runtime error, not a parse error

Sprite ids are invented in the script, so nothing can validate them - `hide: jenny-twni` is a silent
no-op today, since `delete` on a missing key does nothing. Declared sprite *names* are different: the
manifest holds them, so `sprite: hapy` is checkable and belongs to
`../asset-manifest/issues/03-undeclared-assets-are-parse-errors.md`.

Decision: unknown sprite ids stay runtime errors, in the same class as a runaway loop. **The editor
must surface them clearly** rather than letting them vanish. That is a new requirement on the editor
and has no home yet - `design-docs/EDITOR.md` covers autocompletion, docs, list continuation and
find-in-file, but nothing about reporting runtime faults from a running preview. Needs its own ticket.

Left alone deliberately: a custom id may collide with an actor name (`show: {id: Jenny, actor: Bob}`
clobbers Jenny's default sprite). Not worth a rule now.

## Not in scope

- **`position` presets.** The other field `ShowCommandSchema` accepts and `apply()` ignores. Its own
  `TODO` line; doing it here widens the schema migration for no shared benefit.
- **Keyed audio and background assets, with metadata.** The same "manifest as symbol table" move
  applied to `audioAssets` and `backgrounds`, plus track title and artist for the pause menu. Filed
  as `../asset-ids/issues/01-asset-ids-and-metadata.md`. It is the same format change as this one, so
  the two should land under a single `formatVersion` bump rather than making authors migrate twice -
  see that ticket's tie-in section.
- **Hiding every sprite of an actor.** Above.

## See also

- `CONTEXT.md` - sprite, which this splits into *sprite* and *sprite instance*
- `TODO` - Sprites, under UNSEQUENCED; item G is the other half; item E (AssetResolver) is what the
  two of them unblock
- `../asset-ids/issues/01-asset-ids-and-metadata.md` - audio and backgrounds, the same move
- `src/core/commands/sprites/Show.ts`, `src/core/commands/sprites/Hide.ts`, `src/core/state.ts`,
  `src/domRenderer/SpriteRenderer.ts`
- [renpy/sphinx/source/displaying_images.rst](https://github.com/renpy/renpy/blob/master/sphinx/source/displaying_images.rst)

## Comments

### 2026-08-28 - refined against Ren'Py, pose rename dropped

Filed originally out of the domain-modeling pass that produced `CONTEXT.md`, as a three-step sketch:
rename `sprite:` to `pose:`, then `id` names the sprite, then poses as names rather than filenames.

Steps 2 and 3 survive unchanged in substance and are the whole of this ticket now. Step 1 is rejected,
which is why the directory is no longer called `sprite-pose-split`.

What moved the decision was reading Ren'Py rather than reasoning about the words. `as` is step 2
exactly, and `hide`-by-tag closes the old open question ("Does step 2 need `hide` to keep an actor
form?") by dissolving it: there was never an actor form, only a key lookup holding an actor name.

The three open questions this ticket used to carry are answered - pose-or-expression is moot with the
rename gone; `hide` keeps no actor form; `position` stays out. The fourth, whether saved paths care, is
still worth confirming during implementation but is expected to be nothing: a path records actions, not
sprites.

Two new ones surfaced and are recorded above: sprite ids can never be validated (runtime errors, and
the editor needs to say so), and default and custom ids share a namespace (not worrying about it).
