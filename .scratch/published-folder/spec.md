# The published folder: publishing a project, and reading one back by URL

Status: ready-for-agent

Tranche 4 of `design-docs/PROJECT_STORAGE.md`, and the last of its import/export half. Synthesised
2026-09-19 from the design doc, `TODO`, and tranches 2 and 3 as they landed. The maintainer confirmed
the scope and the test seams the same day. **Unlike tranches 2 and 3, it has not been grilled**, so
the decisions below are proposals that triage can overturn, and each one gives its reasoning so an
overturn can see what it is trading.

The drawings are not done yet. The canvas `.scratch/project-library/design.md` links is binding for
pixels and has nothing for this tranche. See "Further Notes".

## Problem Statement

An author can write a project, keep it in the library and get it out of the browser as an archive.
**They cannot let anyone read it.**

- **Nothing an author can make is playable by someone else.** The player link (`?vn=`) carries the
  manifest and the script but no assets, so a story with its own art cannot be shared as a link at
  all. The archive carries the assets, but it is a backup and a reader cannot open it. The only
  playable build that exists is the demo, and it exists only because the build step copies it into
  `dist/`.
- **The player does not play the folder it is served from.** With no `?vn=`, it plays a copy of the
  demo compiled into its bundle. An author who copied `player.html` and its script next to their own
  `manifest.yaml`, `script.yaml` and `assets/` by hand would still see the demo.
- **Nothing reads a published VN back.** The design doc's case for URL import is that *"anything
  anyone published is importable and editable by anyone else, with no archive needing to exist"*,
  and there is no mechanism for it. The demo still reaches the library through `seedDemoProject`,
  which is scaffolding whose own comment names its deletion condition: *"only a URL import of the
  demo published in dist/ retires that"*.

## Solution

One noun ties the tranche together: the **published folder**. It holds `manifest.yaml`,
`script.yaml` and every file the manifest declares, with the player beside them as `index.html`. It
is the shape `dist/` already has, and it is what a static host serves. Three things touch it:

- **The player plays the published folder it is served from.** With no `?vn=` it fetches
  `manifest.yaml` and `script.yaml` from its own directory. The deployed demo keeps working unchanged,
  because `dist/` already is such a folder.
- **Publish** writes a project out as a published folder. It arrives as one zip that the author
  uploads to itch.io, GitHub Pages or Neocities, or extracts onto any static host. It is a control in
  the editor, beside Export ZIP.
- **Import from URL** reads a published folder into the library. This is the publish format read
  backwards. **Add demo project** becomes a URL import of the demo the app is deployed beside, and
  `seedDemoProject` is deleted.

**The invariant: a published folder is complete.** It holds every file its manifest declares.
Publish will not write a folder that is missing one, and URL import will not read one. Both refusals
name the missing files. This is the design doc's *"a partial import is a failure, not a project"*,
applied in both directions. The script never gates, the line ADR 0002 draws: a script with parse
errors or undeclared references publishes and imports freely.

## User Stories

### Publishing

1. As an author, I want to publish my project from the editor, so that people without WebVn can read my story.
2. As an author, I want publishing to produce one zip file, so that I can upload it to itch.io as an HTML game without assembling anything by hand.
3. As an author, I want the zip's `index.html` to be the player, so that the folder's own address plays the story on any static host.
4. As an author, I want a published folder to hold only my manifest, my script and the files my manifest declares, so that files I forgot about are not shipped to readers.
5. As an author, I want publishing to refuse when a declared file is missing, and to name every one, so that no reader reaches a scene that breaks on art I never drew.
6. As an author, I want publishing to refuse a manifest that does not parse, in the same terms Export ZIP uses, so that one rule governs both.
7. As an author, I want a script with parse errors or undeclared references to publish anyway, so that the published story behaves exactly like the preview I have been playing.
8. As an author, I want the published zip to include what I typed a moment ago, so that the build is never missing my last sentence.
9. As an author, I want the Publish control greyed out while my manifest does not parse, as Export ZIP is, so that I know before I click.
10. As an author, I want the published zip to carry a short README saying how to host it and how to work on it again, so that the file explains itself when I find it months later.
11. As an author, I want a published zip to be importable with Import project, so that a build I kept is also a way back into the library.
12. As an author, I want importing a published zip to leave the player's files out of my project, so that they do not sit in it invisibly and ride into every archive I export.
13. As an author, I want the published zip's filename to differ from the archive's, so that I can tell my backup from my build in Downloads.
14. As an author, I want to be told when the player's own files could not be fetched, so that publishing never produces a zip that cannot play.
15. As an author, I want publishing to leave my library's "last exported" line alone, so that a build that dropped my undeclared files never counts as a backup.

### Reading a published VN

16. As a reader, I want to open a published VN's address and have it play, so that I need nothing installed.
17. As a reader, I want my saves in a published VN to be there when I come back, so that I can read it over several visits.
18. As a reader who opened `index.html` straight from my disk, I want the error to say it has to be opened from a web host, so that I am not left looking at a blank stage.
19. As a reader, I want a published VN whose `manifest.yaml` or `script.yaml` will not load to say it could not be loaded, rather than playing some other story.
20. As a reader of the WebVn demo, I want it to keep playing at its address exactly as before, so that nothing I bookmarked broke.
21. As a reader following a player link, I want `?vn=` links to keep working, so that links already shared still open.

### Importing from a URL

22. As an author, I want to import a published VN by pasting its address, so that I can study or remix a story someone published.
23. As an author, I want to paste whatever address my browser showed while I was playing, ending in `index.html`, `player.html`, `manifest.yaml` or no filename, with or without a trailing slash, and have it understood.
24. As an author, I want a pasted player link (`?vn=`) refused with the reason that it carries no assets, so that I do not import the host's demo by accident.
25. As an author, I want an address that is not an `http`/`https` URL refused beside the field I typed it into, so that I can fix it without starting over.
26. As an author, I want import to fetch only what the manifest declares, so that the player's own files and anything else on the host stay out of my project.
27. As an author, I want an import where any declared file fails to arrive to be refused, with the missing files named, so that I never land a project with holes in it.
28. As an author, I want a host that answers a missing file with its index page and a 200 to be caught, so that a web page is never stored as my background.
29. As an author, I want a host that cannot be reached, or that does not let other sites read it, to be refused with a message saying either may be the cause.
30. As an author, I want a refused import to leave my library exactly as it was, including any project it would have overwritten, so that a bad connection never costs me a project.
31. As an author, I want an import whose id is already taken to offer overwrite or cancel, with the same dialog an archive import uses, so that importing works one way whatever the source.
32. As an author, I want the imported project filed under its manifest's id whatever the address says, so that identity works the way it does everywhere else.
33. As an author, I want a host that stops sending mid-file to fail the import, so that the picker is never left busy forever.
34. As an author, I want a published folder too large for my storage, or over the import caps, refused before it fills anything, so that one import cannot starve the library.
35. As an author, I want to stay on the picker afterwards with the new row visible, as after an archive import, so that I can see the project arrived.
36. As an author, I want a folder whose address redirects to be imported from where it actually lives, so that a missing trailing slash or a moved site does not break the import.
37. As an author, I want reloading the page mid-import to leave nothing behind, so that giving up on a slow host is free.

### The demo

38. As a new author, I want Add demo project to give me the same demo it always has, assets included, so that my first minutes are unchanged.
39. As an author, I want the demo in my library to come from the demo the app is deployed beside, so that what I edit is what I can play.
40. As an author whose demo is open in another tab, I want Add demo project refused with that reason, so that two tabs never write one project.
41. As an author, I want a demo whose art will not arrive to fail whole, as any import does, so that the library never holds a demo with silent holes. The seed skipped such files with a console warning.

### Maintaining it

42. As a maintainer, I want publish and URL import to take their file list from one function, so that what one writes and what the other reads cannot come apart.
43. As a maintainer, I want the player's boot out of its self-booting entry point, so that a suite can boot the path that ships.
44. As a maintainer, I want URL import to feed the existing import back half, so that the lock, the overwrite dialog, the save drop, the `created` date and the crash sweep stay written once.
45. As a maintainer, I want `seedDemoProject` gone, so that the demo stops being a special case in the store.
46. As a maintainer, I want zip.js still imported by exactly one module, so that "does the zip library reach the player bundle?" is still answered by one import list.
47. As a maintainer, I want the player's bundle to stop carrying the demo's YAML, so that a published build does not ship a story it never plays.

## Implementation Decisions

### The published folder and its invariant

- **What it is.** `manifest.yaml`, `script.yaml`, every file the manifest declares at the path
  `assetPaths` builds for it, and the player: the player's HTML as `index.html` plus its bundle. Any
  other file in it is ignored. Nothing reads it.
- **It is complete, and that is ADR 0007: "A published folder is complete".** It is written as an ADR
  because on its face it contradicts ADR 0005, which lets an archive carry a manifest declaring files
  nobody has drawn yet, and a later reader will want to "fix" one to match the other. They differ
  because their audiences do. **An archive** is the author's backup of work in progress, and declaring
  before drawing is the normal authoring order. **A published folder** is for readers, and a missing
  file is a scene the renderer throws on when the story reaches it. On the import side there is a
  second reason: a 404 cannot distinguish "never drawn" from "lost in transit", and landing either
  silently is the project-with-holes that the rename recovery exists to prevent. So both directions
  refuse and name the files. The script never gates, as in ADR 0005.
- **One list serves both directions.** A pure function takes a parsed manifest and returns the
  published files: `manifest.yaml`, `script.yaml`, and every declared path from `declaredAssets`,
  **deduplicated**, since two ids can name one file. Publish writes exactly this list and URL import
  fetches exactly this list. When `design-docs/SCRIPT_INCLUDES.md` lands, included scripts join the
  list and both directions learn about them in one change.
- **It is deliberately not the archive's tree copy.** Export walks the whole project directory,
  undeclared files included, because it is a backup. A published folder carries what the manifest
  declares and nothing more. Undeclared files remain the archive's business, and ADR 0006 says why
  they are worth keeping out of anything else.
- **The glossary grows.** `CONTEXT.md` gains **Published folder** (_Avoid_: build, dist, site,
  deployment) and **Publish** (_Avoid_: deploy, release, build, and export, which is the archive's
  word). **Import**'s entry widens from "reading an archive" to "an archive or a published folder".
  **Export**'s line "publishing, which puts a playable project on a host" is corrected: publishing
  *produces* the folder, and the author puts it on the host.

### The player plays the folder it is served from

- **With no `?vn=`, the player fetches `manifest.yaml` and `script.yaml` from its own directory**
  instead of using the demo compiled into its bundle. `dist/` already holds both files at its root,
  so the deployed demo's behaviour does not change, and the demo's YAML leaves the player bundle.
- **The boot moves out of the entry point**, for the reason `editorBoot` moved: an entry point that
  boots itself on import and finds its elements by id cannot be reached by a suite. The player boot is
  told the root, the container, the folder URL and the payload if there is one. It returns a booted
  player or a refusal. The entry point shrinks to wiring.
- **`RelativePathResolver` gets the base URL it was shaped for.** Its comment anticipates a
  constructor argument for exactly this. In production the base is the document's own directory,
  which is what the resolver does today. In a suite it is the served `test-assets/` folder. That is
  also most of a player for VNs hosted on another origin, which stays out of scope (see below).
- **`?vn=` is unchanged.** The payload's assets still resolve against the folder the player is served
  from.
- **Three refusals, one surface.** `manifest.yaml` would not load, `script.yaml` would not load, or
  the manifest does not parse (that one exists today). When the page is on `file:`, the refusal says
  the folder has to be opened from a web host, because that is the first thing a non-developer tries
  after extracting a zip and it otherwise looks like a bug. The surface stays the existing one-line
  load error. A styled error screen belongs to `.scratch/stage-dialogs/`.
- **The demo module (`src/demoStory.ts`) survives with less to do.** It still feeds the demo suite
  its script and the picker the demo's id. Its comment that it "has no reason to exist" once the
  player parses `manifest.yaml` at boot must be corrected, not left standing.

### Importing from a URL

- **A new producer beside the archive feeds the existing back half, `importProject`, unchanged.** It
  turns a URL into the `ArchiveEntry` listing that the zip reader produces from a file, and it does
  not import zip.js. The lock, the room check, the overwrite dialog, clearing the destination,
  dropping the saves, writing the manifest last and recording `created` are all inherited, and so is
  the crash sweep that takes away a manifest-less directory.
- **What the author meant is a pure function of what they typed.**
  - The address must be absolute `http` or `https`.
  - An address carrying a `vn` query parameter is refused as a player link: *it carries a script but
    no assets, and Import takes the address of a published folder*.
  - Otherwise the query and fragment are dropped. A path ending in `/` is the folder. A last segment
    with a dot in it (`index.html`, `player.html`, `manifest.yaml`) is a file, and the folder is its
    directory. Anything else gets a `/` appended.
  - These refusals are the dialog's `validate`, so they appear beside the field with the text still in
    it.
- **The order, and what each step refuses:**
  1. Fetch `manifest.yaml` from the folder. A network error is refused as *could not be reached, or
     does not let other sites read it*. The two are indistinguishable from inside a page, so the
     message names both. A non-OK response, or one served as `text/html`, is *no `manifest.yaml`
     there*.
  2. Parse it. If it does not parse, refuse with the parser's first error, exactly as archive import
     does.
  3. Build the published-file list from the parsed manifest. **Check the entry cap here, before any
     further fetch.** The count is known the moment the manifest parses.
  4. Fetch every other file, resolved against the manifest response's **final** URL, after redirects,
     not against what was typed. At most six requests are in flight at once, which is what a browser
     allows per host over HTTP/1.1 anyway. Each file is read into a Blob with its bytes counted as
     they arrive. **The running total aborts the whole import the moment it passes the byte cap**, so
     a hostile host cannot make the browser buffer without bound. A file that delivers nothing for
     **30 seconds** is abandoned and counts as missing. A response served as `text/html` counts as
     missing: a static host configured for a single-page app answers every unknown path with its
     index page and a 200.
  5. If `script.yaml` is missing, refuse on its own terms, as the archive does. If any declared file
     is missing, refuse and name them: the first handful, plus how many more.
  6. Hand the listing to `importProject`. Each entry's `writeTo` pipes its Blob into the stream the
     back half opens.
- **Everything is fetched before anything is written**, and this is the one place the tranche trades
  away a property the archive has. The archive streams each entry straight into OPFS because its
  bytes are already on disk and its central directory has already answered every question. A host
  can fail halfway. `importProject` clears the destination before it writes, so streaming would let a
  404 on file 37 arrive *after* the author confirmed an overwrite and their project was deleted. The
  cost is that peak memory, or the browser's disk-backed Blob storage, is the size of the project,
  bounded by the byte cap. The gains: a reload mid-fetch leaves nothing behind, and the project lock
  is held only for the write rather than for the whole download.
- **The producer refuses in its own words wherever it can.** Reachability, the manifest, the parse,
  the script, the entry count, the byte total and missing files are all settled before the back half
  is called. The only refusals still reachable in the back half are the room check and the lock, and
  those must read correctly for both sources. Anything there that says "archive" or "unpacks" is
  reworded rather than duplicated.
- **The surface is a new control in the picker's bar**, beside Import project, labelled "Import from
  URL" pending the canvas. It opens a chrome dialog with one field. Its busy state, its place in the
  `InTurn` queue, its orange refusal banner and its success report ("… was imported" / "… replaced
  what was filed under …") are exactly the archive import's, and the author stays on the picker. The
  host name stands in for the filename those messages use.

### The demo is a URL import

- **Add demo project imports from the app's own directory.** The picker is told the demo's URL
  rather than working it out, and the option is **required** for the reason `navigation` is: the
  browser suites run in a page whose URL belongs to vitest, and a default would silently import from
  it. The entry point passes the document's directory. Suites pass the served `test-assets/` folder.
- **`seedDemoProject` is deleted**, which is the deletion condition its own file names. Its one test
  caller moves to the URL import.
- **The button's visibility does not change.** It is hidden while a project filed under the demo's id
  is listed. The id still comes from the demo manifest bundled into the editor. Within one build that
  is the same file the import fetches, so the two cannot disagree. The design doc's *"pressing it
  twice is just the id collision dialog, so 'reset the demo to pristine' arrives for free"* is **not**
  taken here, because it would reverse a tranche 2 decision and change a drawn surface for a feature
  nobody has asked for. Deleting the demo and adding it again still works.
- **The project lock moves into `importProject`.** Add demo project no longer takes it itself. A demo
  open in another tab is refused through the back half's own lock refusal.
- **Two behaviour changes, both accepted:**
  - A declared demo file that will not arrive now fails the whole add. The seed skipped it with a
    console warning.
  - Adding the demo now drops the saves filed under its id. That includes a reader's saves from
    `player.html` on the same origin, which on the deployed site is the same origin. This is
    tranche 3's rule that anything claiming an id drops its saves, applied as written. Guessing that
    these particular saves still fit is exactly the guess that rule refuses to make.

### Publishing

- **It lives in the editor's chrome, beside Export ZIP, and not on the picker's rows.** A publish can
  be refused for missing files, and the editor already marks each one orange on the manifest line
  that declared it. That is where the author fixes them, so the refusal lands where the fix is. The
  flush ordering is also the editor's own: flush the storer, then walk.
- **The gate is Export ZIP's, via `gateOnManifest`.** The control is greyed out while the manifest
  does not parse. Missing files are a refusal on click rather than a greyed-out control. Greying on
  them would mean wiring the gate to the missing-file report, and one sentence naming the files tells
  the author more than a disabled button.
- **The order:**
  1. Flush the storer.
  2. Read the manifest and parse it, refusing as export does.
  3. Check that the script is present.
  4. Check that **every file on the published list is in the store**, refusing with the missing ones
     named.
  5. Fetch the player's files.
  6. Build the zip: `README.txt`, then `index.html` and the player bundle, then the published files.
     The archive's precompressed-media rule (`storesWhole`) applies unchanged.
  7. Deliver it through the existing download anchor, and report it in the chrome's existing message
     line.
- **The host tells publish where the player's files are**, as `navigation` and the demo URL are told
  rather than guessed. In production it fetches `player.html`, written into the zip as `index.html`,
  and `playerIndex.js` from the document's own directory. Suites hand it small stand-ins. **The
  names of the player's files are written down once**, and the same list is what zip import skips
  (below). If the build ever splits the player into more chunks, that list must follow. Nothing
  automated would notice, so it joins `CLAUDE.md`'s hand checks.
- **The zip is written by the same module that already writes archives.** It stays the only module
  that imports zip.js, and it already holds the README machinery, `storesWhole` and the refusal
  shape.
- **The filename is `<project-id>-published.zip`.** It differs from `<project-id>.webvn.zip` so that
  Downloads tells a build from a backup. Windows hides the known extension and shows it as
  `my-story-published`.
- **The README is its own text under the archive README's rules.** It outlives the design, so it
  describes no architecture. It is phrased as an instruction, not a prohibition, and the app URL is
  hardcoded. It says:
  - to put these files on any static web host and open the folder's address;
  - that opening `index.html` from the disk does not work;
  - that to work on the project, open the app and import this zip.
- **Publishing records nothing in `editor.yaml`.** `exported` is still the archive's. A published zip
  carries declared files only, so it is not the backup the picker's "never exported" line is about.
- **Zip import skips the player's files at the archive root by exact path**, as it already skips
  `README.txt`. That makes a published zip import as exactly the project it was built from, which
  keeps the invariant: what publish writes, import reads back. The accepted cost is the same one
  `README.txt` has: a project cannot carry its own root-level `index.html` or `playerIndex.js`
  through an archive round trip.
- **Version skew is accepted.** A published zip carries whichever player the editor was deployed
  with, and publishing again is how a build picks up a newer one.

## Testing Decisions

- **A good test states what an author or reader can observe, through the highest seam that reaches
  it.** For example: this folder imports as this project; this folder is refused and these files are
  named; this project publishes as a zip holding exactly these paths; this folder boots to this first
  stop. It does not count fetches or check internal ordering, except where ordering *is* the
  behaviour. "Nothing is written on a refusal" is asserted by what the library holds afterwards,
  including an overwrite target that is still intact, not by spying on writes.
- **The seams, as confirmed.** They use real fetch against folders the test server serves, not an
  injected `fetch`:
  - **URL import, browser suite, real fetch and real OPFS.** `/test-assets/` is already a same-origin
    published folder, since vitest serves it from the repo root, and it is the success case. Small
    fixture folders beside it provide the failures:
    - a folder with a declared file missing;
    - a folder with no `manifest.yaml`;
    - a folder with no `script.yaml`;
    - a folder whose manifest does not parse;
    - a folder declaring a file the server hands out as `text/html`, which is how the single-page-app
      fallback rule is reached with a static server;
    - an address nothing answers, for the unreachable refusal.

    Also covered: overwrite, cancel, a refusal leaving an existing project intact, and saves dropped
    under the imported id. Check early that the test server serves a `.yaml` fetch as plain text; the
    PNG fetches the existing suites make suggest it does.
  - **Pure functions, unit suite.** URL normalisation: every accepted shape, the player-link refusal,
    the non-http refusal. The published-file list: sprites under their actor, audio, deduplication,
    script and manifest always present. `planImport` keeps its existing unit seam, and the root-level
    player-file skip is added to its cases.
  - **The player boot, browser suite.** Booted against `/test-assets/`, it reaches the demo's first
    stop with assets resolved against that folder. Booted against a folder with no manifest, it
    refuses. With a payload, it plays the payload.
  - **Publish, browser suite**, shaped like the export suite: build the zip and read it back with
    zip.js.
    - The exact path set, player stand-ins included, with undeclared project files absent.
    - A missing declared file refused and named.
    - A manifest that does not parse refused.
    - A sentence typed just before publishing is present, which is the flush.
    - The round trip: the published zip through archive import yields a project holding exactly the
      published files and no player files.
  - **The picker, browser suite.** Add demo project and the Import from URL dialog are driven through
    the DOM, as the archive import already is.
- **Prior art:** the browser suites for archive import and export, the editor-storage suite (which
  seeds the demo today), the picker suite, the unit suite for the archive, and the helpers for OPFS
  scratch roots and the picker.
- **Name fixture ids after their suite.** Every URL import takes a project lock, and
  `navigator.locks` is origin-wide. `CLAUDE.md` records a week lost to two suites sharing
  `old-name`/`new-name`. **The demo's directory is fixed at `webvn-demo`**, so only one suite may add
  the real demo. Every other suite imports a fixture whose manifest carries a suite-specific id.
- **Checked by hand, because nothing automated reaches it:**
  - the 30-second stall;
  - a real cross-origin import from GitHub Pages;
  - the built player under `npm run build`, served statically and playing `dist/`;
  - a published zip extracted onto a static server and played;
  - Publish's fetch of the player files in a real build;
  - the `file:` message.

  These join `enterFullscreen`, `npm run dev` and the download anchor on the existing list.
- **The demo suite is not needed** unless the demo module's exports change. The player change does
  not touch the render loop, and the demo suite drives the story through the harness rather than
  through the player's entry point.

## Out of Scope

- **The linked folder and the IndexedDB handle store: tranche 5.** Writing a published folder, or an
  export, into a directory the author picks is `showDirectoryPicker()`, which is Chromium-only. The
  zip works in every browser, the same ordering argument tranche 3 made for the archive.
  `showSaveFilePicker()` goes with it.
- **A player for VNs hosted on another origin** (`player.html?from=<url>`, `&assets=<url>`). The
  resolver's new base makes it cheap. What it has to decide is CORS and partial failure *for a
  reader*, which the design doc leaves open on purpose.
- **Single-file HTML export, re-encoding on import, content-addressed assets.** All three are named in
  the design doc and none is load-bearing here.
- **The export nag.** Still no evidence for a threshold, and the picker row's "never exported" line
  is still most of its value.
- **Rename-on-import, and "reset the demo" as its own action.** See tranche 3's decision 2.
- **Import progress and cancellation.** Tranche 3 shipped no progress bar and this follows it. The
  stall timeout is what stops a hung host from holding the picker.
- **Dropping a link onto the picker.**
- **Remembering where a project was imported from**, or re-importing to update. The design doc: *"The
  URL is a source, never a live link."*
- **Publishing from the picker's rows.**
- **A styled player error screen** (`.scratch/stage-dialogs/`).
- **Player-side caching** through the Cache API or a service worker.
- **A harder rename warning once a project has been published**, which is an open question in the
  design doc and stays open.

## Further Notes

- **Suggested slicing: four tickets, as confirmed.**
  1. **The player plays the folder it is served from.** Blocked by nothing.
  2. **Importing from a URL.** Blocked by nothing.
  3. **The demo is a URL import.** Blocked by 02.
  4. **Publishing a project.** Blocked by 01, because a published folder has to play, and by 02,
     because the published-file list is 02's.

  **Unlike tranche 3's pair, nothing here has to merge together.** 01 changes nothing for the deployed
  demo, and 02 is useful on the demo alone.
- **The canvas goes first, as tranche 3's four artboards did.** Needed:
  - the Import from URL control in the picker's bar and its dialog, including the dialog refusing an
    address beside the field;
  - a URL import refused, which uses the existing banner with new wording;
  - the Publish control in the editor's chrome, with a refusal naming missing files.

  Publish is a fourth tool button, and `CLAUDE.md`'s rule is "icons on all three tools or none". It
  therefore needs an icon, vendored per ticket as `icons.ts` already does.
- **Departures from `design-docs/PROJECT_STORAGE.md`, to be marked where the doc says the opposite:**
  - **The player is `index.html` in a published folder, not `player.html`.** itch.io requires an
    `index.html`, and a folder's own address should play. The deployed demo keeps `player.html`,
    because its `index.html` is the editor. URL import handles both, being manifest-driven.
  - **The demo button stays hidden while the demo is listed**, rather than reaching the collision
    dialog on a second press.
  - **The completeness rule reaches publish.** The doc states it only for import.
  - **URL import fetches everything before writing anything.** The doc assumes a streaming import
    throughout.
- **The design doc's open question about which hosts URL import can reach stays open.** Ticket 02
  should answer it for GitHub Pages at least, by hand, and write the answer back into the doc. It
  decides whether the dialog has to say "from a host that allows it".
- **One non-guarantee now reaches readers.** Player saves are `vn-save-<id>` in localStorage, and
  localStorage is per origin. Every GitHub Pages site under one user, and possibly every itch.io HTML
  game (unverified), shares one origin. So two published VNs with the same id on such a host share
  saves. The design doc accepts per-library id uniqueness as a non-guarantee, and this is where it
  first costs a reader something. Not fixed here, but worth one sentence in the design doc.
- **When this lands:** `TODO`'s STORAGE section, the design doc's Landed markers, and `CLAUDE.md`'s
  project storage and archive sections all need the update the previous tranches gave them. The last
  of those also needs the player boot's new home and the player-file list among its hand checks.
