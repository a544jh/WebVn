# The published folder: publishing a project, and reading one back by URL

Status: ready-for-agent

Tranche 4 of `design-docs/PROJECT_STORAGE.md`, and the last of its import/export half. Synthesised
2026-09-19 from the design doc, `TODO`, and tranches 2 and 3 as they landed. The maintainer confirmed
the scope and the test seams the same day. **Grilled 2026-09-28** on the five decisions that are
expensive to reverse once built. What survived and what changed is below, and the rest of this file
has been brought into line with it.

The drawings are not done yet. The canvas `.scratch/project-library/design.md` links is binding for
pixels and has nothing for this tranche. See "Further Notes".

## What the grilling settled

**Survived as proposed:**

1. **A published folder is complete (ADR 0007).** Publish refuses to write one missing a declared
   file, and URL import refuses to read one. The reasoning was reordered: it now leads with the round
   trip rather than with the reader, because the reader argument covers only files a script line
   uses. See "The published folder and its invariant".
2. **What a published folder holds.** The player as `index.html`, plus `manifest.yaml`, `script.yaml`
   and the declared files, and nothing else. One addition: the player sets the page title from the
   manifest, so a published VN's tab does not say "WebVn". Vendoring the player's font was raised and
   deferred (see "Out of Scope").
3. **Zip import skips the player's files by exact path**, as it already skips `README.txt`. A rule
   keyed on `index.html` at the archive root was proposed instead, to survive a renamed or
   content-hashed bundle, and turned down as more logic than the case deserves.

**Changed:**

4. **URL import never overwrites.** A taken id is refused, and the author deletes the existing project
   first if they want to import again. This is what makes streaming safe: the destination is always a
   new directory, so a failure mid-download destroys nothing, and the existing crash sweep removes the
   half-written directory. It replaces the proposal to download everything before writing anything.
   As a consequence, a failed import names only the first file that failed rather than every missing
   one.
5. **Add demo project is always shown.** A second press reaches URL import's taken-id refusal, which
   tells the author to delete the demo first. The design doc's "reset the demo to pristine for free"
   is therefore still not had, but the button no longer needs the demo's id, so the demo's YAML leaves
   the editor bundle entirely.

**Reconsidered and kept:**

6. **Import from URL stays, deliberately.** Dropping it was weighed on 2026-09-28, on the grounds that
   one-click importing of someone else's story invites taking it. It stays because a published folder
   is plain files the player must hand every reader anyway - devtools or `wget` recover it in a minute
   - so the button adds convenience, not capability, and the project favours openness over deterrence.
   For the same reason nothing in a published folder is obfuscated: that would cost complexity and
   stop no one determined. Do not read the feature as an oversight, or "fix" it with obfuscation.

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
  puts on any static web host. It is a control in
  the editor, beside Export ZIP.
- **Import from URL** reads a published folder into the library as a new project. It never overwrites
  one. This is the publish format read backwards. **Add demo project** becomes a URL import of the
  demo the app is deployed beside, and `seedDemoProject` is deleted.

**The invariant: a published folder is complete.** It holds every file its manifest declares.
Publish will not write a folder that is missing one, and URL import will not read one. Both refusals
name the missing files. This is the design doc's *"a partial import is a failure, not a project"*,
applied in both directions. The script never gates, the line ADR 0002 draws: a script with parse
errors or undeclared references publishes and imports freely.

## User Stories

### Publishing

1. As an author, I want to publish my project from the editor, so that people without WebVn can read my story.
2. As an author, I want publishing to produce one zip file, so that I can put it on a static web host without assembling anything by hand.
3. As an author, I want the zip's `index.html` to be the player, so that the folder's own address plays the story on any static host.
4. As an author, I want a published folder to hold only my manifest, my script and the files my manifest declares, so that files I forgot about are not shipped to readers.
5. As an author, I want publishing to refuse when a declared file is missing, and to name every one, so that no reader reaches a scene that breaks on art I never drew.
6. As an author, I want publishing to refuse a manifest that does not parse, in the same terms Export ZIP uses, so that one rule governs both.
7. As an author, I want a script with parse errors or undeclared references to publish anyway, so that the published story behaves exactly like the preview I have been playing.
8. As an author who has just published, I want to be told what to do with the zip - put it on a static web host, and not open `index.html` from my disk - so that I am not left holding a file I do not know how to use.
9. As an author whose publish was refused, I want the missing files listed in a dialog I have to dismiss, so that the list is not a line of text I can miss beside the buttons.
10. As an author, I want the published zip to include what I typed a moment ago, so that the build is never missing my last sentence.
11. As an author, I want the Publish control greyed out while my manifest does not parse, as Export ZIP is, so that I know before I click.
12. As an author, I want the published zip to carry a short README saying how to host it and how to work on it again, so that the file explains itself when I find it months later.
13. As an author, I want a published zip to be importable with Import ZIP, so that a build I kept is also a way back into the library.
14. As an author, I want importing a published zip to leave the player's files out of my project, so that they do not sit in it invisibly and ride into every archive I export.
15. As an author, I want the published zip's filename to differ from the archive's, so that I can tell my backup from my build in Downloads.
16. As an author, I want to be told when the player's own files could not be fetched, so that publishing never produces a zip that cannot play.
17. As an author, I want publishing to leave my library's "last exported" line alone, so that a build that dropped my undeclared files never counts as a backup.

### Reading a published VN

18. As a reader, I want to open a published VN's address and have it play, so that I need nothing installed.
19. As a reader, I want the browser tab to show the story's title, so that I can find it among my tabs and bookmarks.
20. As a reader, I want my saves in a published VN to be there when I come back, so that I can read it over several visits.
21. As a reader who opened `index.html` straight from my disk, I want the error to say it has to be opened from a web host, so that I am not left looking at a blank stage.
22. As a reader, I want a published VN whose `manifest.yaml` or `script.yaml` will not load to say it could not be loaded, rather than playing some other story.
23. As a reader of the WebVn demo, I want it to keep playing at its address exactly as before, so that nothing I bookmarked broke.
24. As a reader following a player link, I want `?vn=` links to keep working, so that links already shared still open.

### Importing from a URL

25. As an author, I want to import a published VN by pasting its address, so that I can study or remix a story someone published.
26. As an author, I want to paste whatever address my browser showed while I was playing, ending in `index.html`, `player.html`, `manifest.yaml` or no filename, with or without a trailing slash, and have it understood.
27. As an author, I want a pasted player link (`?vn=`) refused with the reason that it carries no assets, so that I do not import the host's demo by accident.
28. As an author, I want an address that is not an `http`/`https` URL refused beside the field I typed it into, so that I can fix it without starting over.
29. As an author, I want import to fetch only what the manifest declares, so that the player's own files and anything else on the host stay out of my project.
30. As an author, I want an import where any declared file fails to arrive to be refused, naming the file that failed, so that I never land a project with holes in it.
31. As an author, I want a host that answers a missing file with its index page and a 200 to be caught, so that a web page is never stored as my background.
32. As an author, I want a host that cannot be reached, or that does not let other sites read it, to be refused with a message saying either may be the cause.
33. As an author, I want a refused import to leave my library exactly as it was, so that a bad connection never costs me a project.
34. As an author, I want an import whose id is already in my library to be refused before anything is downloaded, telling me to delete that project first if I want to import again, so that a host that fails halfway can never have cost me the project I had.
35. As an author, I want the imported project filed under its manifest's id whatever the address says, so that identity works the way it does everywhere else.
36. As an author, I want a host that stops sending mid-file to fail the import, so that the picker is never left busy forever.
37. As an author, I want a published folder too large for my storage, or over the import caps, refused the moment it passes the limit, with what it wrote removed, so that one import cannot starve the library.
38. As an author, I want to stay on the picker afterwards with the new row visible, as after an archive import, so that I can see the project arrived.
39. As an author, I want a folder whose address redirects to be imported from where it actually lives when the host allows it, and refused as unreachable when it does not, so that a moved site either works or says why.
40. As an author, I want reloading the page mid-import to leave nothing in my library, so that giving up on a slow host is free.

### The demo

41. As a new author, I want Add demo project to give me the same demo it always has, assets included, so that my first minutes are unchanged.
42. As an author, I want the demo in my library to come from the demo the app is deployed beside, so that what I edit is what I can play.
43. As an author whose demo is open in another tab, I want Add demo project refused with that reason, so that two tabs never write one project.
44. As an author, I want a demo whose art will not arrive to fail whole, as any import does, so that the library never holds a demo with silent holes. The seed skipped such files with a console warning.
45. As an author who already has the demo, I want Add demo project to tell me to delete my copy first, so that getting a clean demo is two steps I can see rather than a button that vanished.

### Maintaining it

46. As a maintainer, I want publish and URL import to take their file list from one function, so that what one writes and what the other reads cannot come apart.
47. As a maintainer, I want the player's boot out of its self-booting entry point, so that a suite can boot the path that ships.
48. As a maintainer, I want URL import to feed the existing import back half, so that the lock, the taken-id check, the save drop, the `created` date and the crash sweep stay written once.
49. As a maintainer, I want `seedDemoProject` gone, so that the demo stops being a special case in the store.
50. As a maintainer, I want zip.js still imported by exactly one module, so that "does the zip library reach the player bundle?" is still answered by one import list.
51. As a maintainer, I want neither bundle to carry the demo's YAML, so that a published build does not ship a story it never plays and the editor does not keep a second copy of a file it imports.

## Implementation Decisions

### The published folder and its invariant

- **What it is.** `manifest.yaml`, `script.yaml`, every file the manifest declares at the path
  `assetPaths` builds for it, and the player: the player's HTML as `index.html` plus its bundle. Any
  other file in it is ignored. Nothing reads it.
- **It is complete, and that is ADR 0007: "A published folder is complete".** It is written as an ADR
  because on its face it contradicts ADR 0005, which lets an archive carry a manifest declaring files
  nobody has drawn yet, and a later reader will want to "fix" one to match the other. They differ
  because their audiences do. **An archive** is the author's backup of work in progress, and declaring
  before drawing is the normal authoring order. **A published folder** is what other people receive.
  The ADR gives three reasons, **in this order**:
  1. **The round trip.** What publish writes, URL import reads back. So every refusal URL import
     gives is about a folder someone else made, never about our own output. This is ADR 0005's third
     consequence, applied to the second format. It is the only reason that covers *every* declared
     file.
  2. **A 404 cannot tell "never drawn" from "lost in transit".** Landing either silently is the
     project with holes in it that the rename recovery exists to prevent.
  3. **The reader.** A missing file is a scene the renderer throws on when the story reaches it. This
     covers only files some script line uses, and it stops holding on the day the renderers learn to
     survive a missing file, which `CLAUDE.md` names as a separate change. That is why it comes last.

  The script never gates, as in ADR 0005. **The cost goes in the ADR's Consequences:** an author
  cannot publish while any declaration is ahead of its art, even one no script line uses yet. The
  fix is to remove that declaration. The asset panel never declares ahead in the first place,
  because its Add writes the file and the declaration together.

  Considered and refused: completeness meaning "every file the story can reach", so a declared but
  unused file could travel as a missing asset. It would let a chapter-1 demo publish while chapter 2's
  sprites are only declared, but it makes `Command.references()` the only thing between a reader and
  a crash, and it makes import parse the script to judge completeness.
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
- **The player sets the page's title from the manifest's `title`** as it boots, so a published VN's
  tab shows the story rather than "WebVn". It applies to a `?vn=` payload too, whose manifest carries
  a title just the same. This is done in the player rather than by publish rewriting `index.html`:
  **publish copies the player's files byte for byte and never templates them.**
- **The demo module (`src/demoStory.ts`) survives as a test fixture only.** Once the player fetches
  its folder and the picker stops needing the demo's id (see "The demo is a URL import"), no shipped
  code imports it, and it feeds the test suites their copy of the demo. Its comment that it "has no
  reason to exist" once the player parses `manifest.yaml` at boot must be corrected, not left
  standing.

### Importing from a URL

- **A new producer beside the archive feeds the existing back half, `importProject`, with one option
  added.** It turns a URL into the `ArchiveEntry` listing that the zip reader produces from a file,
  and it does not import zip.js. The lock, dropping the saves, writing the manifest last and recording
  `created` are all inherited, and so is the crash sweep that takes away a manifest-less directory.
  **The option is to refuse a taken id instead of asking.** `importProject` takes the destination's
  lock and then asks `confirmOverwrite` if a project is filed there. URL import asks it to refuse
  instead, still with the lock held, so the answer stays true long enough to act on. The refusal says
  the project is already in the library, and that deleting it is how to import it again.
- **URL import never overwrites.** An archive is a file on the author's disk, so an overwrite that
  fails halfway can be run again. A host can fail halfway and stay down, and `importProject` clears
  the destination before it writes. Refusing a taken id means the destination is always a new
  directory, and that is what makes streaming safe: a failure mid-download has destroyed nothing,
  and what it wrote is a manifest-less directory that the crash sweep removes. The archive keeps
  overwrite-or-cancel. Considered and refused:
  - **Downloading everything before writing anything.** Memory, or the browser's disk-backed Blob
    storage, holds the whole project, and the overwrite question comes only after the whole download.
  - **Streaming into a staging directory, then moving it into place.** OPFS cannot move a directory
    (see the design doc's "Renaming"), so the move is a copy. Every file is written twice, and the
    project needs twice its size in free space.
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
  3. Fetch `script.yaml` the same way. If it is missing, refuse on its own terms, as the archive does.
     It is fetched up front with the manifest, because both are small text files and these are the
     two refusals that say the most.
  4. Build the published-file list from the parsed manifest. **Check the entry cap here, before any
     further fetch.** The count is known the moment the manifest parses.
  5. Hand the listing to `importProject`, with the refuse-on-taken option. It takes the destination's
     lock and refuses a taken id **before any asset is fetched**. It then writes the entries one at a
     time, as it does for an archive. Each entry's `writeTo` fetches its file, resolved against the
     manifest response's **final** URL after redirects rather than against what was typed (a redirect
     the browser could not follow never gets this far - see "Probed" in Further Notes), and pipes
     the response body straight into the stream the back half opened.
     - **The bytes are counted as they pass.** The running total aborts the import the moment it
       passes the byte cap or the free space measured at the start, whichever is lower. A host does
       not reliably say how large its files are in advance, so the entries carry no size for the back
       half's arithmetic check, and the producer enforces the same caps as a running total instead.
     - A file that delivers nothing for **30 seconds** is abandoned.
     - A non-OK response, or one served as `text/html`, fails the file. A static host configured for a
       single-page app answers every unknown path with its index page and a 200.
     - **The first file that fails ends the import, and the refusal names that file.** Naming every
       missing file would mean fetching the rest just to count them. The person importing is usually
       not the author and cannot fix the host, so one name is enough to see what went wrong. Publish,
       which checks the local store, still names every one.
  6. On a failure, the back half aborts the open stream and releases the lock, as it already does for a
     truncated archive. The picker redraws after every import and every redraw runs
     `recoverProjects`, so the half-written directory is gone by the time the refusal is on screen. A
     reload mid-import leaves the same directory for the next picker render to remove.
- **One file at a time is slower than fetching in parallel** on a host serving many small files. It is
  accepted: parallel writes inside `importProject` would speed up both sources, and are a later
  optimisation rather than this tranche's.
- **The producer refuses in its own words.** Reachability, the manifest, the parse and the script are
  settled before the back half is called. A failed file, the byte cap and a stall are raised by the
  producer's own `writeTo`, and the producer reports them in its own words rather than as the generic
  failure the picker shows for an archive that threw. The only refusals the back half gives are the
  taken id and the lock, and those must read correctly for both sources. Anything there that says
  "archive" or "unpacks" is reworded rather than duplicated.
- **The surface is a new control in the picker's bar**, beside Import ZIP, labelled "Import from
  URL" pending the canvas. It opens a chrome dialog with one field. Its busy state, its place in the
  `InTurn` queue, its orange refusal banner and its success report ("… was imported") are exactly the
  archive import's, and the author stays on the picker. The host name stands in for the filename those
  messages use. There is no "replaced what was filed under …" variant, because a URL import never
  replaces anything.

### The demo is a URL import

- **Add demo project imports from the app's own directory.** The picker is told the demo's URL
  rather than working it out, and the option is **required** for the reason `navigation` is: the
  browser suites run in a page whose URL belongs to vitest, and a default would silently import from
  it. The entry point passes the document's directory. Suites pass the served `test-assets/` folder.
- **`seedDemoProject` is deleted**, which is the deletion condition its own file names. Its one test
  caller moves to the URL import.
- **The button is always shown.** Tranche 2 hid it while the demo was listed, and gave two reasons:
  *"a second press would collide with an existing directory; hiding the button once the demo is
  listed is both the collision fix and the honest signal"*. Tranche 3's collision handling has since
  answered the first. With the button always shown, the picker no longer needs the demo's id, so the
  editor bundle stops importing `src/demoStory.ts` and carries no copy of the demo at all. Before
  this, a manifest bundled into the editor had to agree with the one the import fetches.
- **A second press is refused**, through URL import's taken-id refusal: the demo is already in the
  library, and deleting it first is how to add it again. The design doc's *"pressing it twice is just
  the id collision dialog, so 'reset the demo to pristine' arrives for free"* is therefore still not
  had. Getting a clean demo is delete, then add, as it was when the button was hidden, but now the
  page says so.
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
  them would mean wiring the gate to the missing-file report, and a dialog naming the files tells
  the author more than a disabled button.
- **The order:**
  1. Flush the storer.
  2. Read the manifest and parse it, refusing as export does.
  3. Check that the script is present.
  4. Check that **every file on the published list is in the store**, refusing with the missing ones
     named, in a dialog (below).
  5. Fetch the player's files.
  6. Build the zip: `README.txt`, then `index.html` and the player bundle, then the published files.
     The archive's precompressed-media rule (`storesWhole`) applies unchanged.
  7. Deliver it through the existing download anchor, and open the hosting dialog (below).
- **Both outcomes are chrome dialogs, not the message line.** Decided 2026-09-28 against the canvas's
  first draft, which put them in the unstyled line beside the buttons that Export ZIP and Copy player
  link report in. Both are `noticeDialog`s, a single Close button, so no new dialog machinery.
  - **Published:** says the zip is on its way and what it is for - put the files on any static web
    host, then open the folder's address - and that
    opening `index.html` from the disk does not work. This is the README's advice at the moment it is
    needed; the README is for the author who finds the zip months later.
  - **Refused:** lists every missing declared file, each by its path, and says to add it in the
    asset panel or remove its declaration. A list is the reason: the message line holds one sentence,
    and a project with five undrawn backgrounds needs five lines. A manifest that does not parse or a
    missing script, reachable only if the gate is raced, uses the same dialog.

  The picker keeps its orange banner for URL import's refusals, as archive import does: the two
  imports sit side by side and must not report in two different ways.
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
- **The README is its own text under the archive README's rules.** It ships inside every published
  zip and cannot be corrected later, so it describes no architecture, is phrased as an instruction
  rather than a prohibition, and hardcodes the app URL. **This is the exact text:**

  ```
  This is "<title>" (<id>),
  a visual novel made with WebVn.

  To play it, put everything in this zip on any static web host, keeping
  the folders as they are, and open the folder's address in a browser.
  It has to be served from a web host: opening index.html straight from
  your computer will not start it.

  To work on it, open <APP_URL> and import
  this zip file.

  WebVn is free and open source: <SOURCE_URL>

  Published <YYYY-MM-DD> by WebVn.
  ```

  `<title>`, `<id>` and the date come from the manifest and the day of publishing; `<APP_URL>` and
  `<SOURCE_URL>` are the constants the archive README already uses. The title line breaks after the
  id so a long title never pushes the rest of the sentence out; nothing is reflowed. Three choices in it, settled
  2026-09-28:
  - **It speaks to whoever opens the zip** - usually the author, sometimes a reader who downloaded the
    build - and the first paragraph serves both.
  - **"will not start it" stays true forever for this zip**, even if single-file export or `story.js`
    later makes a folder open from the disk: each zip carries the player it was published with.
  - **"keeping the folders as they are"** is there because uploading the files flat, losing `assets/`,
    is the likeliest way to break a published folder.
- **Publishing records nothing in `editor.yaml`.** `exported` is still the archive's. A published zip
  carries declared files only, so it is not the backup the picker's "never exported" line is about.
- **Zip import skips the player's files at the archive root by exact path**, as it already skips
  `README.txt`. That makes a published zip import as exactly the project it was built from, which
  keeps the invariant: what publish writes, import reads back. The accepted cost is the same one
  `README.txt` has: a project cannot carry its own root-level `index.html` or `playerIndex.js`
  through an archive round trip. **The list only ever grows.** A zip published by an older build
  still carries that build's player, so a name that leaves the publish side stays on the skip side.
  A rule keyed on `index.html` at the archive root, reading such a zip by the manifest rather than
  by a list, would also survive a content-hashed bundle. It was considered and turned down, because
  this is a rare case and two exact paths cover it.
- **Version skew is accepted.** A published zip carries whichever player the editor was deployed
  with, and publishing again is how a build picks up a newer one.

## Testing Decisions

- **A good test states what an author or reader can observe, through the highest seam that reaches
  it.** For example: this folder imports as this project; this folder is refused and these files are
  named; this project publishes as a zip holding exactly these paths; this folder boots to this first
  stop. It does not count fetches or check internal ordering, except where ordering *is* the
  behaviour. "Nothing is written on a refusal" is asserted by what the library holds afterwards,
  including a project under the same id that is still intact, not by spying on writes.
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

    Also covered:
    - a taken id, refused with the existing project intact and none of the folder's assets fetched;
    - a file failing partway through the stream, refused and named, with no directory left behind
      once the picker has redrawn;
    - saves dropped under the imported id.

    **The test server, probed 2026-09-28:** vitest serves `/test-assets/*.yaml` as `200 text/yaml`,
    so URL import can fetch its fixtures as they are. A missing file is a real `404` with **no**
    `content-type` and an empty body - never an HTML page with a 200 - so the `text/html` fixture
    has to declare a file that really is HTML (a background named `page.html`, say) for the
    single-page-app rule to be reached.
  - **Pure functions, unit suite.** URL normalisation: every accepted shape, the player-link refusal,
    the non-http refusal. The published-file list: sprites under their actor, audio, deduplication,
    script and manifest always present. `planImport` keeps its existing unit seam, and the root-level
    player-file skip is added to its cases.
  - **The player boot, browser suite.** Booted against `/test-assets/`, it reaches the demo's first
    stop with assets resolved against that folder, and the page's title is the manifest's. Booted
    against a folder with no manifest, it refuses. With a payload, it plays the payload.
  - **Publish, browser suite**, shaped like the export suite: build the zip and read it back with
    zip.js.
    - The exact path set, player stand-ins included, with undeclared project files absent.
    - A missing declared file refused and named.
    - A manifest that does not parse refused.
    - A sentence typed just before publishing is present, which is the flush.
    - The round trip: the published zip through archive import yields a project holding exactly the
      published files and no player files.
  - **The picker, browser suite.** Add demo project and the Import from URL dialog are driven through
    the DOM, as the archive import already is. That includes a second press of Add demo project,
    refused with the demo already listed.
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
  the design doc and none is load-bearing here. Single-file export is also the answer to "`index.html`
  does not open from the disk": a page opened from `file:` may not `fetch()` its neighbours (Chrome
  refuses the scheme, Firefox gives every local file its own origin), so the player's two YAML
  fetches fail, while `<img>`, `<audio>` and `<script src>` still load. A smaller fix was considered
  and deferred with it on 2026-09-28: publish also writes the manifest and script into a `story.js`
  beside `index.html`, which the player reads when present and fetches the YAML otherwise. It costs a
  script tag in the player, a duplicate of the story in the folder, and a place on the published-file
  list.
- **The export nag.** Still no evidence for a threshold, and the picker row's "never exported" line
  is still most of its value.
- **Rename-on-import, and "reset the demo" as its own action.** See tranche 3's decision 2.
- **Overwriting a project from a URL.** Refused by design; see "URL import never overwrites".
- **Vendoring the player's font.** `player.html` loads Source Code Pro from `fonts.googleapis.com`,
  so a published folder is not self-contained. Played offline it falls back to another font, and
  every reader's IP address goes to Google, which a Munich court ruled in 2022 breaches GDPR. The
  fix belongs to the player rather than to publish, and is deferred. It is recorded here as a known
  gap in what a published folder holds.
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

- **Four tickets, as confirmed, cut 2026-09-28 into `issues/01` to `issues/04`.** ADR 0007 and the
  `CONTEXT.md` entries were written with them.
  1. **The player plays the folder it is served from.** Blocked by nothing.
  2. **Importing from a URL.** Blocked by nothing.
  3. **The demo is a URL import.** Blocked by 02.
  4. **Publishing a project.** Blocked by 01, because a published folder has to play, and by 02,
     because the published-file list is 02's.

  **Unlike tranche 3's pair, nothing here has to merge together.** 01 changes nothing for the deployed
  demo, and 02 is useful on the demo alone.
- **The canvas goes first, as tranche 3's four artboards did.** Drawn 2026-09-28 as the canvas's
  third page, *Published folder*, for review. Needed:
  - the Import from URL control in the picker's bar and its dialog, including the dialog refusing an
    address beside the field;
  - a URL import refused, which uses the existing banner with new wording, including a taken id;
  - the picker's bar with Add demo project always present, which redraws a tranche 2 board;
  - the Publish control in the editor's chrome, with a refusal naming missing files.

  Publish is a fourth tool button, and `CLAUDE.md`'s rule is "icons on all three tools or none". It
  therefore needs an icon, vendored per ticket as `icons.ts` already does.
- **Departures from `design-docs/PROJECT_STORAGE.md`, to be marked where the doc says the opposite:**
  - **The player is `index.html` in a published folder, not `player.html`.** A static host serves a
    folder's own address from its `index.html`, so that address is what plays. The deployed demo keeps `player.html`,
    because its `index.html` is the editor. URL import handles both, being manifest-driven.
  - **A second press of the demo button is refused**, rather than reaching the collision dialog. The
    button is always shown, but "reset the demo to pristine" does not arrive for free.
  - **The completeness rule reaches publish.** The doc states it only for import.
  - **URL import refuses a taken id** instead of raising the collision dialog that the doc gives
    every ingestion path. The archive keeps the dialog.
  - **A refused URL import names the first file that failed**, not every missing file as the doc's
    "fail the whole import and name the missing files" has it.
- **Probed 2026-09-28, against the deployed demo and in headless Chromium.** Four findings:
  1. **GitHub Pages can be imported from.** A page on another origin (`http://localhost`) fetched
     `manifest.yaml` and `script.yaml` from `https://a544jh.github.io/webvn-demo/`: `200`,
     `text/yaml`, full bodies. Curl shows why: every response, a `404` included, carries
     `Access-Control-Allow-Origin: *`. A missing file is a real `404` served as `text/html`, readable
     by the page, not a single-page-app fallback. Everything is `Cache-Control: max-age=600`, so a
     folder re-published and imported within ten minutes can arrive stale.
  2. **GitHub Pages' redirects cannot be followed from another origin.** `…/webvn-demo` answers
     `301` to `…/webvn-demo/` **without** `Access-Control-Allow-Origin`, and a browser refuses a
     cross-origin redirect that lacks it: the fetch fails as `Failed to fetch`, indistinguishable from
     an unreachable host. The address rule sidesteps the common case - a last segment with no dot
     gets its `/` before anything is fetched - but a moved site, a custom domain, or http-to-https
     behind a redirect without the header is a refusal, not a redirect followed. Resolving against
     the final URL still matters for hosts whose redirects carry the header.
  3. **A page opened from `file:` cannot fetch its neighbours.** `fetch("manifest.yaml")` from a
     `file://` page throws `Failed to fetch`, while `new Image()` loads `assets/…` beside it. So the
     player's `file:` refusal is right, and it is the YAML fetch, not the assets, that needs a web
     host. Chromium only; Firefox and Safari not tried.
  4. **The test server** serves `.yaml` as `text/yaml` and a missing file as a bare `404` - see
     Testing Decisions.

  **Internal note: other hosts' CORS is unverified.** Only GitHub Pages has been probed. itch.io,
  Neocities and the rest may or may not send `Access-Control-Allow-Origin`, and a host that does not
  cannot be imported from at all. That decides whether the Import from URL dialog has to say "from a
  host that allows it". The user-facing text names no host - it says "any static web host" - so none
  of this reaches an author; it is here for whoever answers the next "why did my import fail". To repeat the browser probes in a cloud session, Chromium has to trust the
  session proxy's CA: add the interception certificates from its bundle to `~/.pki/nssdb` with
  `certutil` rather than turning certificate checks off.
- **One non-guarantee now reaches readers.** Player saves are `vn-save-<id>` in localStorage, and
  localStorage is per origin. Every GitHub Pages site under one user shares one origin, and other
  hosts that put several sites on one domain may too. So two published VNs with the same id on such a host share
  saves. The design doc accepts per-library id uniqueness as a non-guarantee, and this is where it
  first costs a reader something. Not fixed here; the design doc says so under its `vn-save-<id>` decision.
- **When this lands:** `TODO`'s STORAGE section, the design doc's Landed markers, and `CLAUDE.md`'s
  project storage and archive sections all need the update the previous tranches gave them. The last
  of those also needs the player boot's new home and the player-file list among its hand checks.
