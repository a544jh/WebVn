# 05: A thumbnail on the row

Status: needs-triage

Blocked by: nothing in code - 01 through 04 have landed. Blocked in practice by an artboard, see
"The canvas has to go first".

## What this is

Asked for 2026-09-19 as "small preview icons in the list": a picture of the asset itself in each row,
so an author scanning `cliffs`, `jetty`, `storm` can see which one is which without opening any of
them.

It is the first thing the panel would draw that is neither the manifest's text nor a fixed glyph, and
that is the whole of its difficulty. Everything below is either a decision the drawing needs made or
a mechanism the panel does not have yet.

**Called a thumbnail, not a preview.** `preview` is already the row's `eye` control (the file in a new
browser tab) and, informally, the live-preview player beside the editor; a third meaning would leave
the word saying nothing. Note `CONTEXT.md` has no _Preview_ entry at all, which is why the collision
is easy to miss - **this ticket should add both entries**, `Thumbnail` and `Preview`, rather than
leaving the second implied by two spent usages. The `_Avoid_` line on _Thumbnail_ wants `preview`,
`icon` (the chrome's Lucide glyphs are icons) and `swatch`.

## The canvas has to go first

`spec.md` says the canvas is binding for pixels and that where it and the code disagree, the code is
the one that moved. A thumbnail is a visual addition, so it is the canvas's to decide and not this
file's. Two existing artboards would have to be redrawn (**AssetPanel** and **AssetMissing**), and
the three questions in the next section are the ones a drawing answers by drawing them.

The constraint the drawing is working inside, which was not true when the other artboards were made:
the column is 280px wide and now **720px tall, exactly** - `#vn-session-column` says so since
2026-09-19, and ticket 01's comments say why. Measured inside that (2026-09-19, headless Chromium):
the title strip is 37px, the footer 61px, and the list is left **620px**, in which a row is **21px**
and **29 of them fit**. So a taller row costs visible project: a 24px thumbnail needs a 28px row and
drops that to 21, and an author with three actors and a dozen backgrounds starts scrolling a list
that used to fit. Whether that trade is worth making, and at what thumbnail size, is the drawing's
call and not the implementer's.

## Three decisions it needs

**1. What an audio row shows.** Two of the three kinds have an image and one cannot have one. The
slot is either empty for audio, or it carries a Lucide glyph - in which case the row has a glyph
where its neighbours have a picture, and `icons.ts` grows a name (add it to `ICONS`, which is what
keeps the other ~1500 out of the bundle). Drawing a waveform from the file is a different ticket and
probably never: it means decoding audio to draw a picture of it.

_Leaning_: a glyph, because an empty slot at a uniform indent reads as a thumbnail that failed to
load rather than as a kind of asset that has none.

**2. What a missing asset shows.** The row is already orange and already says "not drawn yet". An
`<img>` pointed at a file that is not there adds the browser's own broken-image glyph on top, which
is a second complaint about one problem - the thing the panel already refuses to do with the manifest
tab's red (`assetPanel.css` says so where `.vn-asset-panel-stale` is deliberately not red).

_Leaning_: draw no thumbnail at all on a missing row and let the orange and the note carry it, the
way `preview` is *absent* rather than greyed on those rows. The panel already knows which rows they
are - `missingKeys` is what `row()` is handed.

**3. Where the bytes come from, and what it costs to draw them.** This would be `AssetResolver`'s
third consumer after `loadAsset` and preview. Under the editor's `OpfsAssetResolver` a path resolves
to an object URL minted once and never revoked, so the URLs are free on a redraw; the **decode** is
not, and neither is `resolve` itself being async in a draw that is otherwise synchronous. Under the
player's `RelativePathResolver` there is no cache at all - though the player never draws this panel,
so that matters only if something else grows a thumbnail later.

Two routes, and the ticket should pick one rather than discovering it:

- **Ask the resolver per row.** Simple, and it makes `drawList` async or leaves each row filling in
  after the fact. N `resolve` calls per redraw.
- **Ask the image loader.** `ImageAssetLoaderSrc` already holds every declared background and sprite
  decoded, keyed by the same logical path, and `getAsset` hands out a `cloneNode()` that re-fetches
  its `src` - so a thumbnail could be a clone of what the stage is already using, with no resolve and
  no second decode. This is the more interesting option by some distance: it is synchronous, it
  reuses bytes the editor has already paid for, and it means a replaced asset's thumbnail is correct
  for free, because ticket 04's rebuild is what already invalidates that cache. It also couples the
  panel to a loader it does not currently know about, and audio would still need the glyph above.

_Leaning_: the loader, and check `objectUrlLifetime.test.ts` before relying on the clone - it pins
why a revoked URL yields an element that silently never loads.

## The redraw is the part that will bite

The panel `replaceChildren`es its whole root on every `onManifestSettledCallbacks`, which includes
every adopt-on-blur. That is fine for spans and it is not obviously fine for N images: the wholesale
redraw is already in `ROUGH_EDGES.md` as "an adoption landing mid-click can swallow the click", and
today it costs one lost press of the one control that is live while the manifest does not parse.
Heavier rows make that window wider, and a thumbnail that flickers on every blur is worse than no
thumbnail.

**So this ticket probably has to make the draw incremental**, or prove it does not. Either is fine;
guessing is not. If it does, the diffing draw is the fix `ROUGH_EDGES.md` already names for the
swallowed click, so the two land together and that entry goes.

## Out of scope

- Any thumbnail anywhere but this panel.
- Decoding audio to draw a waveform. See decision 1.
- Loader eviction, still. Ticket 04 refused it for the same reason: it has a test aimed at it
  (`objectUrlLifetime.test.ts`) and should not ride in on a feature.

## Tests

`test/browser/AssetPanel.test.ts`, which is store-less and points at what vitest serves out of the
repo root - so `a.png` is a file that is there and anything else is one that is not, which is how
both halves of decision 2 are reachable. What is worth pinning:

- a background row draws a thumbnail, and the element's source is the file the declaration names
- an audio row draws whatever decision 1 settles on, and not an `<img>`
- a missing row draws no thumbnail, and still carries its orange and its note
- the row's height, against whatever the canvas says, since that is what decides how much of a
  project is visible at once
- a replaced asset's thumbnail shows the new bytes - `ReplaceAsset.test.ts` is the store-backed suite
  and the one place a cache is visible, so it belongs there rather than here

## Comments

**Filed 2026-09-19** on `claude/hello-6ggj3s`, alongside the tranche it follows, rather than built
there: the three commits on that branch after the tranche were corrections to what it shipped (a
debounced panel write, the replace tooltip, the unbounded column), and this is new scope with a
drawing and three decisions in front of it.
