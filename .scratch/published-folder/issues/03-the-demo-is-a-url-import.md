# 03: The demo is a URL import

**Status:** ready-for-agent

**Blocked by:** 02 (Importing from a URL).

## What to build

**Add demo project** becomes a URL import of the demo the app is deployed beside, and
`seedDemoProject` is deleted - the deletion condition its own file has named since tranche 1. The
button is **always shown**. Once the demo is in the library, pressing it again is URL import's
taken-id refusal, which tells the author to delete their copy or rename it. With no reason left to know the
demo's id, the picker stops importing the demo module, and neither bundle carries the demo's YAML.

Spec: `.scratch/published-folder/spec.md`, "The demo is a URL import".

- **The picker is told the demo's URL**, and the option is **required**, for the reason
  `navigation` is: the browser suites run in a page whose URL belongs to vitest, and a default would
  silently import from it. The entry point passes the document's own directory; suites pass the
  served `test-assets/` folder.
- **The project lock moves into the back half.** The button no longer takes it; a demo open in
  another tab is refused through `importProject`'s own lock refusal.
- **Always shown** reverses tranche 2's "shown only while the demo is absent". Tranche 2's reasons
  were the collision and the signal; the collision now has a refusal, and the row arriving plus the
  "… was imported" line are the signal. Getting a clean demo is delete, then add; keeping a
  tinkered copy as well is rename (a new id in its `manifest.yaml`), then add. The refusal names
  both. The picker's comment on the button says this rather than the old reasoning.
- **Behaviour changes, all accepted:**
  - A declared demo file that will not arrive fails the whole add. The seed skipped it with a warning.
  - Adding the demo drops the saves filed under its id, including a reader's saves from
    `player.html` on the same origin - tranche 3's "anything claiming an id drops its saves".
  - A second press is a refusal where it used to be impossible.

## Acceptance criteria

- [ ] Add demo project, driven through the picker's DOM against the served `test-assets/` folder,
      lands the demo with every asset and leaves the author on the picker with its row visible.
- [ ] Pressed again with the demo listed, it is refused - "To add it, delete or rename the existing
      project." - and the demo is untouched. The wording is the canvas's *Add demo project with the
      demo already listed* board.
- [ ] Pressed while the demo is open in another tab, it is refused through the back half's lock.
- [ ] `seedDemoProject` is gone; its test callers import the demo by URL instead.
- [ ] No shipped code imports the demo module - checked against `npm run build`'s two bundles.
- [ ] Only one suite adds the real demo, whose directory is fixed. Every other suite imports a
      fixture with a suite-specific id.
- [ ] The picker bar matches the canvas's redrawn board, with the button present while the demo is
      listed.
