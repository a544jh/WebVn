# 02: Importing from a URL

**Status:** done

**Blocked by:** None (can start immediately). Read the design canvas's *Published folder* page
before building the surface - it draws the control, the dialog and both refusals.

## What to build

An author pastes the address of a published VN into the picker and it arrives in their library as a
new project, assets included. **A URL import never overwrites**: if the manifest's id is already
filed, it is refused before anything is downloaded, and the author deletes that project, or renames
it to a new id, if they want to import again. Because the destination is always new, the files stream straight into it
and nothing is at risk while the network is involved.

Spec: `.scratch/published-folder/spec.md`, "Importing from a URL" and "The published folder and its
invariant". ADR 0007 is the completeness rule this ticket enforces on the way in.

- **The published-file list is this ticket's**, and it is the one function publish (ticket 04) will
  write from: given a parsed manifest, `manifest.yaml`, `script.yaml` and every declared path from
  `declaredAssets`, deduplicated, since two ids can name one file. Pure.
- **What the author meant is a pure function of what they typed:** absolute `http`/`https` only; an
  address carrying `vn` is refused as a player link, which carries a script but no assets; otherwise
  query and fragment are dropped, a trailing `/` is the folder, a last segment with a dot in it is a
  file whose directory is the folder, and anything else gets a `/`. These refusals are the dialog's
  `validate`, so they sit beside the field with the text still in it.
- **A new producer feeds the existing back half**, `importProject`, and does not import zip.js. The
  back half gains **one option: refuse a taken id instead of asking**. It still takes the lock first
  and asks second, so the answer stays true long enough to act on; the archive keeps asking.
- **The order:**
  1. Fetch `manifest.yaml`. A network error is *could not be reached, or does not let other sites
     read it* - the two are indistinguishable from inside a page. A non-OK response, or one served
     as `text/html`, is *no `manifest.yaml` there*.
  2. Parse it; refuse with the parser's first error, as archive import does.
  3. Fetch `script.yaml` the same way, and refuse on its own terms if it is missing.
  4. Build the published-file list and check the entry cap - before any further fetch.
  5. Hand the listing to `importProject` with refuse-on-taken. It refuses a taken id **before any
     asset is fetched**, then writes the entries one at a time. Each entry fetches its file against
     the manifest response's **final** URL, after redirects, and pipes the body into the stream the
     back half opened.
     - A running byte total aborts the import the moment it passes the byte cap or the free space
       measured at the start, whichever is lower. Hosts do not reliably say sizes up front, so the
       entries carry none for the back half's arithmetic check.
     - A file that delivers nothing for 30 seconds is abandoned.
     - A non-OK response, or one served as `text/html` (a single-page-app host answering every path
       with its index page and a 200), fails the file.
     - **The first file that fails ends the import, and the refusal names it.**
  6. A failure leaves a manifest-less directory, which the picker's redraw sweeps through
     `recoverProjects` before the refusal is on screen. A reload mid-import leaves it for the next
     render. No new cleanup code.
- **The producer refuses in its own words**, never as the generic "something broke" the picker shows
  for an archive that threw. The back half's two remaining refusals, the taken id and the lock, must
  read correctly for either source: anything there saying "archive" or "unpacks" is reworded, not
  duplicated.
- **The surface** is an **Import from URL** control in the picker's bar and a chrome dialog with one
  field. Busy state, `InTurn` queue, orange refusal banner and "… was imported" report are exactly the
  archive import's, with the host name where the filename goes. There is no "replaced what was filed
  under" variant. Its icon is vendored per `icons.ts`'s rule.

## Acceptance criteria

- [x] Unit: URL normalisation, every accepted shape, the player-link refusal, the non-http refusal.
- [x] Unit: the published-file list - sprites under their actor, audio, deduplication, script and
      manifest always present.
- [x] Browser, real fetch and real OPFS: the served `test-assets/` folder imports as a project
      holding exactly its manifest, script and declared files, with its saves dropped.
- [x] Browser, fixture folders beside it: a declared file missing (refused, named); no
      `manifest.yaml`; no `script.yaml`; a manifest that does not parse; a declared file served as
      `text/html`; an address nothing answers. Each refused in its own words.
- [x] A taken id is refused with the existing project intact and none of the folder's assets fetched.
- [x] A file failing mid-stream leaves no directory once the picker has redrawn.
- [x] The picker suite drives the dialog through the DOM, including a refusal beside the field.
- [x] Every banner reads as the canvas's *Picker - every URL import banner* board draws it: that
      board is the exact wording for each refusal and for the success report.
- [x] Fixture ids are named after their suite - `navigator.locks` is origin-wide.
- [x] Checked 2026-09-28: the test server serves `.yaml` as `200 text/yaml`, and a missing file as
      a bare `404` with no `content-type` - so the `text/html` fixture declares a real `.html` file.
- [ ] By hand, recorded in the ticket: the 30-second stall, and a real cross-origin **import** from
      GitHub Pages end to end. Already probed 2026-09-28 (spec, "Probed" in Further Notes): a page on
      another origin fetches the demo's `manifest.yaml` and `script.yaml` (`200`, `text/yaml`), every
      response carries `Access-Control-Allow-Origin: *`, a missing file is a real `404`, and
      responses are cached for ten minutes.
- [x] A redirect without `Access-Control-Allow-Origin` - GitHub Pages' own `301` from `…/name` to
      `…/name/` is one - is refused as unreachable, not followed. The address rule keeps the
      trailing-slash case from ever fetching the redirecting URL; a unit case pins that.
- [x] `CONTEXT.md`'s Import entry already covers this; nothing to change unless the build disagrees.

## Comments

**Landed 2026-09-28** on `claude/laughing-bell-erlp50`.

- `publishedFiles` and `publishedFolderAt` are in `src/publishedFolder.ts`, pinned by
  `test/unit/publishedFolder.test.ts`. The producer is `src/storage/urlImport.ts`, `importFromUrl`,
  with its two stream guards (`metered`, `Watchdog`) exported for `test/unit/urlImport.test.ts`, since
  a static test server never trips either. The dialog is `src/picker/urlImportDialog.ts`.
- **The back half's option is `{ refuseTaken: true }`**, beside `{ confirmOverwrite }`, and a taken id
  comes back as a result kind of its own, `taken`, carrying the directory and the title rather than a
  worded refusal: Add demo project (ticket 03) words the same fact differently, per the canvas.
- **One refusal the spec did not list**: a manifest may declare a filename with `..` in it, since a
  filename is free text, and the back half would refuse the resulting path in an archive's words. The
  producer refuses it first: "it declares a file outside its folder". Filenames are also URL-encoded
  one segment at a time, so a `#` or `?` in one is not read as a fragment or a query.
- **Two wordings are not on the canvas's banner board and were written here**: the byte cap as
  opposed to free space ("it passed 2000.0 MB, which is the limit", with the entry cap's advice), and a
  file whose request *fails* past the manifest, which says "stopped arriving" like a stall - the folder
  was reachable a moment ago. Quotes are straight, as the archive's shipped banners are,
  where the canvas draws curly ones.
- The "none of the folder's assets fetched" assertion reads resource timing. Checked by mutation that
  it is not vacuous: an asset fetched and read before the lock turns it red. (A fetch whose body is
  never read makes no entry, so it is read-to-the-end fetches that it sees - which is every one the
  producer makes.)
- **Checked by hand 2026-09-28: the 30-second stall.** `dist/` behind a local Python server with one
  folder whose declared PNG sends its headers and 1KB and then nothing: the picker reported
  "127.0.0.1:8766 was not imported: assets/backgrounds/slow.png stopped arriving. Nothing was written.
  The site may be busy - try again later." after 30.1s, and no directory was left behind.
- **Not checked: the real cross-origin import from GitHub Pages end to end.** In this cloud session
  headless Chromium does not trust the egress proxy's interception CA, and putting it into the
  browser's NSS store was not permitted, so the fetch fails as a certificate error - which the import
  reports, correctly, as "could not be reached". The spec's own probe (headless Chromium, 2026-09-28)
  already showed the two YAML fetches succeeding cross-origin with `Access-Control-Allow-Origin: *`;
  what remains is one import of `https://a544jh.github.io/webvn-demo/` from a local build, by hand.

**After review, 2026-09-28** (the two-axis code review over the whole tranche):

- **A failed import no longer drops the saves under its id.** `importProject` used to drop them before
  the first file was written, so a refused URL import - a 404, a stall, the byte cap - erased
  `vn-save-<id>` while the banner said "Nothing was written"; on the deployed site that is a reader's
  playthrough of the published build, lost to a flaky network. Saves now go when an overwrite destroys
  the project they described, or when the import commits - never before, for a new directory.
  `test/browser/UrlImport.test.ts` pins it, and was red before the change.
- The size in the byte-limit banner is `sizeLabel`, which says gigabytes once the amount is that big,
  as the canvas's board does ("it passed 1.4 GB, which is all the room there is").
- A failure writing into OPFS mid-file - a quota, a refused write - is no longer reported as the file
  having "stopped arriving": only a failed or abandoned request is the site's. Anything else reaches
  the picker as a failure.
- The two YAML files go through the same meter and stall timer as every other file, so the timer is
  fed per chunk rather than being a 30-second deadline, and their bytes count toward the limit.
- **Still by hand, and still open**: the GitHub Pages import above. A body that errors partway through
  is not reachable from a static test server either - the browser suite's "file failing partway"
  case is a later file 404ing after an earlier one was written, and the mid-body abort is the unit
  suite's `metered` case.
