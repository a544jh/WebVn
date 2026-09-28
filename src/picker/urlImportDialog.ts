import { dialogField, openDialog } from "../chrome/dialog"
import { publishedFolderAt } from "../publishedFolder"

// Import from URL's one question: where the published folder is. The canvas's *Import from URL - the
// dialog* board, and its player-link board for the refusal beside the field.
//
// **What the address means is refused here, and what the network says is not.** A player link, or
// anything that is not an http or https address, is decided from the text alone by
// `publishedFolderAt`, so it is said beside the field with what was typed still in it. Everything a
// site says - unreachable, no manifest there, a file that did not arrive - lands in the picker's
// banner after the dialog has gone, because by then there is nothing left in the field to fix.

// Resolves with the folder's address, or null if the author backed out.
export const askForPublishedFolder = async (): Promise<string | null> => {
  const address = dialogField("Address", "The folder's own address, or any page in it - index.html, manifest.yaml.")
  // An address is an identifier rather than a name, so it wears the face the id field does.
  address.input.classList.add("vn-dialog-input-mono")
  address.input.spellcheck = false
  address.input.placeholder = "https://"
  // Typing into a field that was just marked is the author answering; the complaint goes with the
  // thing it was about.
  address.input.addEventListener("input", () => address.setProblem(null))

  let folder: string | null = null
  const confirmed = await openDialog({
    title: "Import from URL",
    body: [
      "Paste the address of a published WebVn story. It arrives in your library as a new project, with its art and audio - a copy, so it keeps working if that site goes away.",
    ],
    content: address.row,
    confirmLabel: "Import",
    destructive: false,
    validate: () => {
      const meant = publishedFolderAt(address.input.value)
      address.setProblem(meant.kind === "refused" ? meant.problem : null)
      folder = meant.kind === "folder" ? meant.url : null
      return folder !== null
    },
  })
  return confirmed ? folder : null
}
