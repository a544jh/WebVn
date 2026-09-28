# 02: Importing from a URL

**Status:** ready-for-agent

**Blocked by:** None (can start immediately). Read the design canvas's *Published folder* page
before building the surface - it draws the control, the dialog and both refusals.

## What to build

An author pastes the address of a published VN into the picker and it arrives in their library as a
new project, assets included. **A URL import never overwrites**: if the manifest's id is already
filed, it is refused before anything is downloaded, and the author deletes that project first if
they want to import again. Because the destination is always new, the files stream straight into it
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

- [ ] Unit: URL normalisation, every accepted shape, the player-link refusal, the non-http refusal.
- [ ] Unit: the published-file list - sprites under their actor, audio, deduplication, script and
      manifest always present.
- [ ] Browser, real fetch and real OPFS: the served `test-assets/` folder imports as a project
      holding exactly its manifest, script and declared files, with its saves dropped.
- [ ] Browser, fixture folders beside it: a declared file missing (refused, named); no
      `manifest.yaml`; no `script.yaml`; a manifest that does not parse; a declared file served as
      `text/html`; an address nothing answers. Each refused in its own words.
- [ ] A taken id is refused with the existing project intact and none of the folder's assets fetched.
- [ ] A file failing mid-stream leaves no directory once the picker has redrawn.
- [ ] The picker suite drives the dialog through the DOM, including a refusal beside the field.
- [ ] Fixture ids are named after their suite - `navigator.locks` is origin-wide.
- [ ] Checked early: the test server hands a `.yaml` fetch out as text.
- [ ] By hand, recorded in the ticket: the 30-second stall, and a real cross-origin import from
      GitHub Pages. Already known from curl against the deployed demo (2026-09-28): `.yaml` is served
      `200` as `text/yaml`, every response carries `Access-Control-Allow-Origin: *`, a missing file is
      a real `404` as `text/html`, and everything is cached for ten minutes. What is left to see is a
      browser page's own `fetch` succeeding. The answer to which hosts are reachable is written back into
      `design-docs/PROJECT_STORAGE.md`'s open question.
- [ ] `CONTEXT.md`'s Import entry already covers this; nothing to change unless the build disagrees.
