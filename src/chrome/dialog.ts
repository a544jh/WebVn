import "./chrome.css"
import "./dialog.css"

// The authoring chrome's confirm-and-prompt surface.
//
// **Not `window.confirm` and `window.prompt`.** An id needs its validation message beside the field
// it belongs to, which a browser prompt cannot do at all, and `ROUGH_EDGES.md` already has the
// player's three browser dialogs down as a smell to move away from rather than a pattern to copy.
//
// In `src/chrome/` because it has two hosts and belongs to neither: the picker opens these with no
// editor mounted, and a rename fires one from inside an editor. Calling it "the editor's own" was
// true when the library was a panel and would now rule out half its callers.
//
// Built on `<dialog>` and `showModal()` rather than a hand-rolled overlay: the platform supplies the
// backdrop, the top layer, the focus trap and Escape-to-dismiss, and every one of those is a thing
// this codebase would otherwise get subtly wrong. Escape resolves false, like Cancel.

export interface DialogOptions {
  readonly title: string
  // Paragraphs, in order. Say what will happen, and say what cannot be undone.
  readonly body?: string[]
  // Whatever goes between the body and the buttons - a form, a field. The caller keeps its own
  // references and reads them back after this resolves.
  readonly content?: HTMLElement
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  // Called when Confirm is pressed. Return false to refuse: the dialog stays up with what the author
  // typed still in it, and **saying why is the caller's**, against the field it belongs to - which
  // is the whole reason this is not `window.prompt`. Nothing else can veto a confirm, so validation
  // lives in one place per dialog.
  readonly validate?: () => boolean
  // Wears the error colour, for an action that destroys something.
  readonly destructive?: boolean
  // No Cancel button: this dialog states something rather than asking it.
  readonly dismissOnly?: boolean
}

// Resolves true when confirmed, false when cancelled or dismissed. The element is removed either
// way, so nothing accumulates in the body across a session's worth of dialogs.
export const openDialog = (options: DialogOptions): Promise<boolean> => {
  const dialog = document.createElement("dialog")
  dialog.classList.add("vn-dialog")

  const heading = document.createElement("h2")
  heading.classList.add("vn-dialog-title")
  heading.textContent = options.title
  dialog.appendChild(heading)

  for (const paragraph of options.body ?? []) {
    const elem = document.createElement("p")
    elem.classList.add("vn-dialog-body")
    elem.textContent = paragraph
    dialog.appendChild(elem)
  }

  if (options.content !== undefined) dialog.appendChild(options.content)

  const buttons = document.createElement("div")
  buttons.classList.add("vn-dialog-buttons")

  const cancel = document.createElement("button")
  cancel.type = "button"
  cancel.classList.add("vn-dialog-cancel")
  cancel.textContent = options.cancelLabel ?? "Cancel"
  cancel.addEventListener("click", () => dialog.close("cancel"))

  const confirm = document.createElement("button")
  confirm.type = "button"
  confirm.classList.add("vn-dialog-confirm")
  if (options.destructive === true) confirm.classList.add("vn-dialog-destructive")
  confirm.textContent = options.confirmLabel ?? "OK"
  confirm.addEventListener("click", () => {
    if (options.validate?.() ?? true) dialog.close("confirm")
  })

  // Cancel first, then Confirm, in the DOM and on screen alike: Cancel is what Enter and the first
  // tab reach, and Confirm is where the eye ends up.
  if (options.dismissOnly !== true) buttons.appendChild(cancel)
  buttons.appendChild(confirm)
  dialog.appendChild(buttons)

  document.body.appendChild(dialog)
  const answered = new Promise<boolean>((resolve) => {
    // Fires however the dialog closed, Escape included, so this is the one place it is taken down.
    dialog.addEventListener("close", () => {
      dialog.remove()
      resolve(dialog.returnValue === "confirm")
    })
  })
  dialog.showModal()
  return answered
}

// Nothing to decide, so one button. A refusal that offered "Cancel" beside "Close" would be asking
// a question it has no answer for.
export const noticeDialog = (title: string, body: string[]): Promise<boolean> =>
  openDialog({ title, body, confirmLabel: "Close", dismissOnly: true })

// Destroying a project, which three dialogs ask about in the same breath: deleting one, renaming onto
// one, and importing onto one. They differ in what is being destroyed and why, so the caller supplies
// that; what they share is the sentence about it being gone for good.
//
// **That sentence used to end "there is no export yet, so nothing outside this browser has a copy",
// and tranche 3 is what made it untrue.** A project that was exported does have a copy outside the
// browser, and the picker row now says when it was. What stays true is the half about the copy in
// OPFS, which is the one this dialog is about to remove.
//
// In `src/chrome/` for the reason the surface itself is: one host is the picker with no editor
// mounted, the others are inside one.
export const confirmDestroyingProject = (
  title: string,
  what: string,
  confirmLabel: string,
  // Whatever else there is to say after the sentence they share - the import's reassurance that the
  // archive itself is untouched, and its line about how to keep both, which is what standing on
  // overwrite-or-cancel owes the author.
  ...also: string[]
): Promise<boolean> =>
  confirmDialog(
    title,
    [what, "It cannot be recovered from here - only an archive you exported has a copy of it.", ...also],
    confirmLabel
  )

// **Renaming onto a project and importing onto one ask the same question in the same words**, and
// differ by a verb: both destroy a project the author did not mention, in order to put another one
// where it was. `AppShell.confirmOverwrite`'s comment promised this outright before there was an
// import to promise it to.
//
// A second question rather than a louder version of the first - a rename or an import is a decision
// about the project in front of the author, and this is a decision about a different one.
export const confirmOverwritingProject = (
  id: string,
  folder: string,
  // The gerund of what is landing on it: "renaming", "importing".
  by: string,
  ...also: string[]
): Promise<boolean> =>
  confirmDestroyingProject(
    `Overwrite "${id}"?`,
    `A project is already filed under ${folder}, and ${by} onto it destroys that project - its script, its manifest, every asset and its saves.`,
    "Overwrite",
    ...also
  )

// The common case: a question with no fields. Destructive by default, because that is what a
// confirmation is nearly always for here - deleting a project, overwriting one.
export const confirmDialog = (
  title: string,
  body: string[],
  confirmLabel: string,
  destructive = true
): Promise<boolean> => openDialog({ title, body, confirmLabel, destructive })

// One labelled text field with its own note underneath, which is the shape both fields of the
// new-project dialog take. Returned rather than appended, so a caller lays its own form out.
export interface DialogField {
  readonly row: HTMLElement
  readonly input: HTMLInputElement
  // Marks the field and replaces its note with the reason, or clears both. **Beside the field it
  // belongs to** - a validation message about an id has nowhere useful to go if it is not there,
  // which is the argument against `window.prompt` stated as a method.
  setProblem(message: string | null): void
}

export const dialogField = (label: string, hint?: string): DialogField => {
  const row = document.createElement("label")
  row.classList.add("vn-dialog-field")

  const caption = document.createElement("span")
  caption.classList.add("vn-dialog-label")
  caption.textContent = label
  row.appendChild(caption)

  const input = document.createElement("input")
  input.type = "text"
  input.classList.add("vn-dialog-input")
  row.appendChild(input)

  // One element for both, because a field says either what it is for or what is wrong with it, and
  // never both at once: the problem is the more urgent answer to the same question.
  const note = document.createElement("span")
  note.classList.add("vn-dialog-hint")
  note.textContent = hint ?? ""
  note.hidden = hint === undefined
  row.appendChild(note)

  return {
    row,
    input,
    setProblem: (message) => {
      input.classList.toggle("vn-dialog-input-problem", message !== null)
      note.classList.toggle("vn-dialog-hint-problem", message !== null)
      note.textContent = message ?? hint ?? ""
      note.hidden = note.textContent === ""
      // Only once it is wrong, so a screen reader is not read the hint as an alert on every open.
      if (message === null) note.removeAttribute("role")
      else note.setAttribute("role", "alert")
    },
  }
}
