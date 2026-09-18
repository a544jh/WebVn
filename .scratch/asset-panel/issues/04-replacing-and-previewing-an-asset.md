# 04: Replacing and previewing an asset

Status: done

Blocked by: 01 (the asset panel), for the row controls. Independent of 02 and 03.

## What to build

Two more row controls. **Replace** gives an asset new bytes under the same id and the same filename.
**Preview** opens the file in a new browser tab.

Together they are what makes a **missing asset** fixable from the panel: the orange row has no
preview, because there is nothing to open, and its replace is how the author supplies the file that
was declared. The controls on a row always describe what is actually possible for it.

## Replace is a cache-invalidation problem

This is the whole ticket, and it is not visible from the outside.

`loadAsset` early-returns when the path is already loaded, **before** consulting the resolver -
`AudioAssetLoaderSrc` says that ordering "is the whole reason the resolver lives in `loadAsset`
rather than in its caller". So writing new bytes to `assets/backgrounds/cliffs.png` changes nothing
on screen: the loader still holds the decoded element under that key, and `OpfsAssetResolver`'s
object URL - minted once per path and never revoked - still points at the old blob. Re-adopting the
manifest does not help, because `loadAssets` calls `loadAll` calls `loadAsset`.

**So replace writes the file and then rebuilds the loaders.** Discard them, re-register from the
current state, load, render. Every asset reloads; these are local OPFS reads and the editor already
reloads assets on every manifest adoption, so the cost is one the session is used to paying. The
overlapping-render hazard is covered by `renderGeneration`, which is what stops a superseded pass
from auto-advancing the story that replaced it.

**Two alternatives were refused.** *Writing to a new filename* and editing the declaration sidesteps
the cache by minting a new key, but an author re-exporting `cliffs.png` picks a file with that name,
so it would have to mint `cliffs-2.png` and then `cliffs-3.png` - filenames drifting away from ids
forever, for a mechanism the author never asked for. *Giving the loaders eviction* is the right
change eventually and is deliberately not this ticket's: `AssetResolver`'s comment spells out that
revoking breaks the `cloneNode()` every `getAsset` returns, and `test/browser/objectUrlLifetime.test.ts`
pins both halves of it. That is a change with a test aimed at it, and it should not be the price of
admission for a file picker.

## The one interface change

`loadAssets(state?)` gains a discard option - `loadAssets(state?, { discard })` or equivalent - on
the `Renderer` interface. A flag rather than a new method: `loadAssets` already re-registers and
loads, and discarding first is a mode of what it does rather than a second concept, so the interface
grows a parameter instead of a member. Every implementation has to carry it, which is the cost of
`Renderer` being deliberately minimal.

Keeping it off the interface and having the panel hold a concrete `DomRenderer` was considered and
refused: `VnEditor` manages on `Renderer` alone, and the panel should not be the one part of the
editor that knows which renderer it has.

## Replace, step by step

1. `<input type="file">`, as ticket 02 - the mechanism every browser offers.
2. **Write the bytes to the existing path.** No dialog, no id, no filename: the declaration does not
   change, so there is nothing to ask. The picked file's own name is ignored.
3. Rebuild the loaders and re-render.

**No confirmation**, deliberately, and it is the one write here that does not get one. Replacing art
is the iteration loop - export, replace, look at the stage - and a dialog in the middle of it is
friction on the thing the panel exists to make fast. It cannot fire by accident either: it takes a
row control *and* a file-picker round trip. Remove keeps its confirmation because it changes what the
project is; replace only changes what a thing looks like.

## Preview

The control is Lucide's `eye`; replace is Lucide's `replace`. Both need the `icons.ts` shape
change ticket 01 makes - `eye` carries a `<circle>` and `replace` a `<rect>`.

`window.open(await resolver.resolve(path))`. A blob URL under OPFS, a relative path under the
player's resolver, and the browser's own image or audio viewer does the rest - no preview UI to
build, and it works for both kinds of asset.

**This makes the panel a second consumer of `AssetResolver`.** Its comment currently says it is
"consulted in exactly one place - `AssetLoader.loadAsset`", which will stop being true. Edit the
comment rather than leaving it to mislead: resolving a path to a URL is exactly what the interface
is for, and the sentence was describing a fact about callers, not a rule about them. Going through
the loader instead does not work - `getAsset` hands back a cloned element, not a URL.

The URL stays valid indefinitely because `OpfsAssetResolver` never revokes, which is an existing
decision paying off sideways. A tab left open keeps working.

**Absent, not disabled, on a missing asset**: `resolve` rejects because there is no file, and a
control that cannot do anything should not be drawn as one that is temporarily unavailable.

## Gated

Replace is disabled while the manifest does not parse, for the same reason remove is even though it
writes no buffer: the panel is showing the last manifest that was adopted, so the row's path may not
be what the buffer declares, and replace would overwrite a file the current manifest does not point
at - silently, since there is no dialog to notice it in. **Every write this panel does is gated on
the manifest parsing** is a rule a reader can hold; an exception for replace is one they will get
wrong.

Preview is not a write and is not gated.

## Tests

`test/browser/`, through `startEditor`:

- replacing a background writes the new bytes to the same path and leaves the manifest byte-identical
- **the stage shows the new image afterwards** - the regression test for the whole ticket, and the
  one that fails if the loader rebuild is dropped
- a missing asset's row has no preview control and does have replace
- replacing a missing asset's file clears the orange, on the row and on the manifest gutter
- replace is disabled while the manifest does not parse

## Comments

**Landed 2026-09-18** (`b53f428`). `AssetPanel.replace` and `AssetPanel.preview`,
`Renderer.loadAssets(state?, { rebuild })`, `AssetLoader.clear()` on both loaders, and
`VnEditor.reloadAssets`; `test/browser/ReplaceAsset.test.ts` is store-backed throughout, because a
cache this is about is not visible through an in-memory stand-in.

**The option is `rebuild`, not `discard`.** `CONTEXT.md`'s Remove entry puts `discard` on its *Avoid*
list for taking an asset out of a project, and "discard the loaders" beside "discard the asset" is
exactly the collision that list exists to prevent. The ticket says "or equivalent".

**The loaders are cleared, not replaced**, which the ticket's "discard them" would read as. The three
sub-renderers were handed those two objects in their constructors, so minting new ones would leave
every one of them reading the old.

**The panel calls `VnEditor.reloadAssets` rather than the renderer directly**, which is more than the
ticket asks and is what the orange-clearing test needs: a file that has arrived is no longer missing,
and a gutter can only forget a marker by being cleared - so the editor rebuilds it from the parse
problems the last parse recorded. The panel still never learns which renderer it has, which is the
property the ticket refuses to give up.

**The regression test was checked by dropping the rebuild**, as the ticket demands of it: "shows the
new image afterwards" fails, and so does the orange-clearing one.

**Two hidden file inputs in one root turned out to be ambiguous.** The footer's Add input and each
row's Replace input shared a class at first, and the first match in the document became a row's
replace rather than Add asset - caught by ticket 02's suite. They are named apart now
(`.vn-asset-add-input`, `.vn-asset-replace-input`).

**`file-up` was not needed.** The canvas's note wondered whether Lucide's `replace` holds up at 15px;
it reads fine in the running editor, so it stays.

**Found in review: the loader rebuild was not enough, and this ticket's headline requirement was not
met.** `BackgroundRenderer.render` leaves its canvas alone unless the background moved and
`SpriteRenderer` remakes an element only when its path changed - and a replace moves nothing. So the
loader held the new bytes while the scene went on showing the old ones, and the test said it passed
because it asserted the loader.

Forgetting the committed state was tried first and does not reach it: `state.panTo !== prev?.panTo`
compares values that are both `undefined` on a still scene, and `shouldTransition` is cleared by
`advance`, so the branch is skipped either way. What works is an explicit `repaint` on each of the
two sub-renderers that hold an image, driven from `loadAssets({ rebuild })` - the frame that is
already there, drawn from the files as they now are, which cannot flash. Audio is deliberately not
repainted: restarting the music because an author replaced a file is a worse surprise than hearing
the old track until the next `bgm`.

The tests sample the canvas and the sprite element now, and both fail with the repaint removed.
