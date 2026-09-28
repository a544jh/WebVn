// The published folder: a project as a reader receives it. `manifest.yaml`, `script.yaml` and every
// file the manifest declares, with the player beside them as `index.html` - the shape `dist/` already
// has, and what any static web host serves as a playable story. `.scratch/published-folder/spec.md`,
// and docs/adr/0007-a-published-folder-is-complete.md for its invariant.
//
// **Three things touch it, and this module is what they share**: the player, which plays the folder
// it is served from; publish, which writes one; and URL import, which reads one back. Top-level rather
// than under `src/storage/`, because the player reads a published folder too and must not reach into
// the store to do it - `src/storage/archive.ts` is where zip.js lives, and nothing the player imports
// may lead there.

export const MANIFEST_FILE = "manifest.yaml"
export const SCRIPT_FILE = "script.yaml"

// Whether a response is the file that was asked for. **Not `response.ok` alone**: a static host set
// up for a single-page app answers every address it does not know with its front page and a 200, so a
// missing `manifest.yaml` arrives as HTML - and read as YAML, a web page is a manifest that does not
// parse, which blames the file for a host's routing. Nothing in a published folder is HTML: the one
// page in it is the player, and nothing fetches that.
export const isServedFile = (response: Response): boolean =>
  response.ok && !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")
