# 03: The demo is a URL import

**Status:** done

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

- [x] Add demo project, driven through the picker's DOM against the served `test-assets/` folder,
      lands the demo with every asset and leaves the author on the picker with its row visible.
- [x] Pressed again with the demo listed, it is refused - "To add it, delete or rename the existing
      project." - and the demo is untouched. The wording is the canvas's *Add demo project with the
      demo already listed* board.
- [x] Pressed while the demo is open in another tab, it is refused through the back half's lock.
- [x] `seedDemoProject` is gone; its test callers import the demo by URL instead.
- [x] No shipped code imports the demo module - checked against `npm run build`'s two bundles.
- [x] Only one suite adds the real demo, whose directory is fixed. Every other suite imports a
      fixture with a suite-specific id.
- [x] The picker bar matches the canvas's redrawn board, with the button present while the demo is
      listed.

## Comments

**Landed 2026-09-28** on `claude/laughing-bell-erlp50`.

- `ProjectPicker`'s fourth argument is now an options object, `PickerOptions { demoFolder, refusal? }`, with
  `demoFolder` required; `AppShellOptions.demoFolder` threads it from the entry point, which passes
  `pageFolder(location.href)` (in `src/publishedFolder.ts`, shared with the player's entry point).
  Every suite that builds a picker or a shell and does not add the demo passes `NO_DEMO` from
  `test/helpers/picker.ts`, an address nothing answers, so pressing the button by mistake is refused
  as unreachable rather than contending for the demo's lock.
- **`test/browser/DemoProject.test.ts` is the one suite that adds the real demo.** The picker suite's
  "adding the demo" block and the storage suite's "opens the seeded demo playable" moved into it,
  rewritten for the URL import. It also carries ticket 02's "the served `test-assets/` folder imports
  as a project holding exactly its manifest, script and declared files, with its saves dropped", since
  that is the same import of the same fixed id.
- The success line is "The demo was added." with `"WebVn Demo" is in your library.` - no board draws
  it, and the refusal's "The demo was not added:" is its pair. The lock refusal reads "The demo was
  not added: "webvn-demo" is open in another tab. Nothing was imported. Close it there and try again."
- **Checked against `npm run build`**: neither `dist/app.js` nor `dist/playerIndex.js` contains the
  demo's script. The one `webvn-demo` left in `app.js` is the archive README's hardcoded app address.
  By hand in the built app: Add demo project lands the demo with no missing file marked, and a second
  press reads "The demo was not added: WebVn Demo is already in your library, under webvn-demo. To add
  it, delete or rename the existing project."
- The `?raw` webpack rule is dormant now - nothing that ships imports `src/demoStory.ts`. Left in place,
  and `CLAUDE.md` says so.
