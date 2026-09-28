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

import { seedState, VnManifest } from "./core/manifest"
import { declaredAssets } from "./domRenderer/assetPaths"

export const MANIFEST_FILE = "manifest.yaml"
export const SCRIPT_FILE = "script.yaml"

// Whether a response is the file that was asked for. **Not `response.ok` alone**: a static host set
// up for a single-page app answers every address it does not know with its front page and a 200, so a
// missing `manifest.yaml` arrives as HTML - and read as YAML, a web page is a manifest that does not
// parse, which blames the file for a host's routing. Nothing in a published folder is HTML: the one
// page in it is the player, and nothing fetches that.
export const isServedFile = (response: Response): boolean =>
  response.ok && !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")

// **The one list both directions take their files from**: publish writes exactly this, and URL import
// fetches exactly this, so what one writes and what the other reads cannot come apart. The manifest
// and the script, then every file the manifest declares at the path `assetPaths` builds for it -
// **once each**, since two ids may name one file and a folder holds a file once.
//
// Only what the manifest declares, and that is the difference from an archive: export walks the whole
// project directory, undeclared files included, because it is a backup. A published folder is what
// other people receive, and ADR 0006 says why an undeclared file is worth keeping out of it. When
// `design-docs/SCRIPT_INCLUDES.md` lands, included scripts join this list and both directions learn
// about them in one change.
export const publishedFiles = (manifest: VnManifest): string[] => {
  const { images, audio } = declaredAssets(seedState(manifest))
  return [MANIFEST_FILE, SCRIPT_FILE, ...new Set([...images, ...audio].map((asset) => asset.path))]
}

// What an author meant by what they typed into Import from URL: the published folder's address, or
// why that is not one - said beside the field, with the text still in it.
export type FolderAddress =
  | { readonly kind: "folder"; readonly url: string }
  | { readonly kind: "refused"; readonly problem: string }

// **A pure function of the text**, because every address a browser shows while a published VN plays
// has to be understood, and none of them needs a request to tell apart:
//
// - An address carrying `vn` is a player link. It holds a script and no assets, and importing the
//   folder it happens to sit in would import the host's demo by accident.
// - Otherwise the query and the fragment go. A path ending in `/` is the folder; a last segment with
//   a dot in it - `index.html`, `player.html`, `manifest.yaml` - is a file, and the folder is its
//   directory; **anything else gets its `/` here, before anything is fetched.** GitHub Pages answers
//   `/name` with a redirect to `/name/` that carries no CORS header, and a page on another origin
//   cannot follow it, so the address that redirects must never be the one requested.
export const publishedFolderAt = (typed: string): FolderAddress => {
  let url: URL
  try {
    url = new URL(typed.trim())
  } catch (e) {
    return { kind: "refused", problem: NOT_AN_ADDRESS }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "refused", problem: NOT_AN_ADDRESS }
  if (url.searchParams.has("vn")) return { kind: "refused", problem: PLAYER_LINK }

  url.search = ""
  url.hash = ""
  const last = url.pathname.slice(url.pathname.lastIndexOf("/") + 1)
  if (last.includes(".")) url.pathname = url.pathname.slice(0, url.pathname.length - last.length)
  else if (last !== "") url.pathname += "/"
  return { kind: "folder", url: url.href }
}

const NOT_AN_ADDRESS = "That is not a web address. Paste one that starts with https:// or http://."
const PLAYER_LINK =
  "That is a player link. It carries a script but no art or audio - paste the address of the published folder instead."
