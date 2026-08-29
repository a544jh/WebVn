# Pin what a clone needs from an object URL

Status: ready-for-agent

`design-docs/PROJECT_STORAGE.md`, "Load-bearing details": *object URLs must survive until story
teardown*. On TODO as `E -> object URL lifetime test`. Small, and worth doing before the OPFS
resolver rather than after, because the failure it guards against is silent.

## The hazard

Both loaders hand out copies, not the element they hold:

```ts
// ImageAssetLoaderSrc.getAsset, AudioAssetLoaderSrc.getAsset
return asset.cloneNode() as HTMLImageElement
```

A clone copies `src` and starts its own load of it. Against a relative path that is free - the
browser serves it from the HTTP cache - and it is why nobody has had to think about this. Against
`blob:` there is no cache and no origin server: the URL is a handle into a table the page owns, and
once `URL.revokeObjectURL` is called there is nothing behind it. The clone then fails to load and
`SpriteRenderer.createSpriteElem`'s `if (!elem)` does not catch it, because `getAsset` returned an
element - just an empty one. A sprite renders as a blank box, or a background never paints, with
nothing thrown and nothing logged.

Ticket 05's `OpfsAssetResolver` is the first thing in this codebase to ever hand the loaders a URL
that can be revoked. This test is what makes the rule visible to whoever writes it.

It is also what backs ticket 01's decision that `AssetResolver` has no `release` method and that
revocation, when eviction eventually needs it, belongs to the loader rather than to the thing that
minted the URL. That decision is only safe if the consequence of getting it wrong is written down
somewhere executable, and this is that somewhere.

## The test

`test/browser/objectUrlLifetime.test.ts`, or added to `test/browser/assetLoaders.test.ts` alongside
the missing-file tests it is a sibling of. `test-assets/` is served from the repo root, so
`fetch("/test-assets/assets/backgrounds/a.png")` gives a real `Blob` to make a URL from - note the
doubled segment, which is `test-assets/` the served directory plus `assets/` inside the project.

Two assertions, and the pair is the point:

- **Every clone taken while the URL is live loads.** Register an object URL, `loadAll`, then take two
  or three `getAsset` clones at different times and assert each one decodes. This is the behaviour
  the OPFS resolver depends on and the one a future eviction change must not break.
- **A clone taken after the URL is revoked does not.** Same setup, then `URL.revokeObjectURL`, then
  `getAsset` and assert the clone fails to load - `decode()` rejects, or `naturalWidth` stays 0. It
  asserts a broken thing is broken, which is unusual, and it earns its place by being executable
  documentation: it is what a "revoke on load, we already decoded it" change would trip over, and
  that change is otherwise entirely reasonable-looking.

Both need a comment saying which is which, because on a fast read the second looks like a bug being
enshrined.

## Notes for the implementer

- **Audio may not settle the same way.** `HTMLAudioElement` clones do copy `src`, but a failed load
  surfaces as an `error` event and a non-null `.error` rather than a rejected promise, and how much
  of a media file a browser loads before firing anything is less predictable than `img.decode()`. Do
  the image assertions first and completely; if the audio pair turns out to need timing luck to be
  reliable, leave it out and say so in a comment rather than shipping a flaky test. The rule is the
  same for both loaders and one loader can carry it.
- **Revoke what the test mints.** A leaked object URL in a test is harmless, but the test after it
  should not be able to see it.
- Nothing in `src/` changes. If this test needs a production change to pass, that is a finding worth
  reporting rather than a licence to make one.
