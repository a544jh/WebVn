// Handing a file to the author, which is one anchor and three lines - and it is here rather than in
// `src/storage/` because that layer is deliberately UI-free, and rather than in either caller
// because both surfaces export: a picker row and a button inside the editor.
//
// **`<a download>` over an object URL, in every browser.** The archive's whole justification in
// design-docs/PROJECT_STORAGE.md is that it is "not a preference for a single file, but the only
// mechanism the platform offers in every browser", so making its happy path Chromium-only would
// undercut what it exists for - and two delivery paths would mean the non-Chromium one is the
// untested one.
//
// `showSaveFilePicker()` is deliberately not used. It would let zip.js stream entries straight into
// the chosen file and let the author pick where it lands, but it is Chromium-only; it is the natural
// growth when the linked-folder layer ships, being the same permission surface. Memory in the
// meantime is bounded well enough in practice: Chromium spills large Blobs to disk, and a project
// that does not fit in a Blob does not fit in OPFS either.
//
// **Nothing automated covers this.** A headless browser will not show you a file arriving in
// Downloads, so the browser suites assert the archive's *bytes* and the anchor is verified by hand,
// the way `enterFullscreen` and `npm run dev` already are.
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  // Not appended to the document: a click on a detached anchor still starts the download, and
  // appending one would put an invisible element in the page for whatever runs next to find.
  anchor.click()
  // Revoked, because nothing else ever would and the blob behind it is a whole project - but on the
  // next task rather than on this one. The download is started by the click and reads the URL as it
  // goes; revoking in the same turn has been reported to cancel it, and a task's delay costs
  // nothing.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
