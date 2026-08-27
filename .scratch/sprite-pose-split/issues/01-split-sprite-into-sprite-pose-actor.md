# Split "sprite" into sprite / pose / actor

Status: needs-triage

Deferred for later refinement. Filed out of the domain-modeling pass that produced
`CONTEXT.md`; nothing here is decided beyond the vocabulary the glossary already
carries.

## The problem

`sprite` names three different things today:

- `Sprite` in `src/core/state.ts` - an on-screen entry with an actor, an image, a
  position and an anchor
- `Sprite.sprite` - the image filename that entry uses
- `Actor.sprites?: string[]` - the list of filenames available for an actor

So the word for the output of `show` is also the key for one of its inputs.

The knock-on effect is in `Show.apply` (`src/core/commands/sprites/Show.ts`), which
keys the sprite map by actor:

```ts
const newSprites = { ...state.animatableState.sprites, [this.cmd.actor]: newSprite }
```

One sprite per actor, permanently. `ShowCommandSchema` already accepts `id` and
`position` and `apply()` silently drops both - `id` has nowhere to go while the actor
*is* the key. That is the "Custom sprite IDs - multiple instances of the same actor"
line under Sprites in `TODO`, and the reason it cannot be done as a small patch.

## Proposed vocabulary

Already written into `CONTEXT.md`, and the thing to push back on first if any of it
is wrong:

- **actor** - who is on screen
- **pose** - which image of them (`_Avoid_`: expression)
- **sprite** - one instance of that actor on screen, with its own position and anchor

## Sketch, in three steps

Steps 1 and 2 are independent of everything else. Step 3 waits on the asset manifest
(item D in `TODO`).

### 1. Rename `sprite:` to `pose:`

```yaml
- show:
    actor: A1
    pose: 2.png
    x: .2
```

Behaviourally nothing changes. Touches `ShowCommandSchema`, the `Sprite` type,
`Actor.sprites` -> `Actor.poses`, `SpriteRenderer`, `demoStory.ts`.

### 2. `id` names the sprite

The sprite becomes the addressable thing and the actor becomes an attribute of it:

```yaml
- show:
    id: twin-left
    actor: A1
    pose: idle.png
    x: .25
- show:
    id: twin-right
    actor: A1
    pose: 2.png
    x: .75
```

With `id` defaulting to the actor's name, existing scripts keep working untouched -
`show: {actor: A1, pose: idle.png}` is the sprite named `A1`. `hide` takes an `id`
rather than an actor.

### 3. Poses as names, not filenames

```yaml
actors:
  A1:
    poses:
      idle: a1/idle.png
      smug: a1/2.png
```

```yaml
- show: {actor: A1, pose: smug, x: .2}
```

The script then never names a file, which is what makes the asset layer swappable.
Blocked on item D (asset manifest out of `demoStory.ts`), since that is what gives a
project somewhere to declare its own assets.

## Open questions

- **pose or expression?** Both are VN convention. The glossary picks pose and lists
  expression under `_Avoid_`; nothing is committed to it.
- **Does step 2 need `hide` to keep an actor form?** Hiding every sprite of an actor
  is a plausible thing to want, and `hide: A1` reads better than enumerating ids.
- **Is `position` worth reviving in the same pass?** It is the other field
  `ShowCommandSchema` accepts and `apply()` ignores, and it is its own `TODO` line
  ("Position presets"). Doing both at once means one migration of the schema rather
  than two, but widens the change.
- **Do saved paths care?** They should not - a path records actions, not sprites - but
  worth confirming before touching the state shape.

## See also

- `CONTEXT.md` - actor, pose, sprite
- `TODO` - Sprites, under UNSEQUENCED; item D under READY NOW blocks step 3
- `src/core/commands/sprites/Show.ts`, `src/core/state.ts`, `src/domRenderer/SpriteRenderer.ts`
