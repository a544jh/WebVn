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
  // Called when Confirm is pressed. Return a message to refuse - it is shown and the dialog stays
  // up, with what the author typed still in it - or null to accept. Nothing else can veto a confirm,
  // so validation lives in one place per dialog.
  readonly validate?: () => string | null
  // Wears the error colour, for an action that destroys something.
  readonly destructive?: boolean
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

  // Empty until a validate refuses, and cleared on the next attempt, so it never describes the
  // previous try. `role="alert"` because it appears after the author has acted.
  const problem = document.createElement("p")
  problem.classList.add("vn-dialog-problem")
  problem.setAttribute("role", "alert")
  problem.hidden = true
  dialog.appendChild(problem)

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
    const refused = options.validate?.() ?? null
    problem.textContent = refused ?? ""
    problem.hidden = refused === null
    if (refused === null) dialog.close("confirm")
  })

  // Cancel first in the DOM so the confirm is not what Enter reaches by accident, and second on
  // screen: CSS orders the row, which is what keeps the tab order and the layout independent.
  buttons.append(cancel, confirm)
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

// The common case: a question with no fields. Destructive by default, because that is what a
// confirmation is nearly always for here - deleting a project, overwriting one.
export const confirmDialog = (
  title: string,
  body: string[],
  confirmLabel: string,
  destructive = true
): Promise<boolean> => openDialog({ title, body, confirmLabel, destructive })

// One labelled text field with its own hint, which is the shape both fields of the new-project
// dialog take. Returned rather than appended, so a caller lays its own form out.
export interface DialogField {
  readonly row: HTMLElement
  readonly input: HTMLInputElement
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

  if (hint !== undefined) {
    const note = document.createElement("span")
    note.classList.add("vn-dialog-hint")
    note.textContent = hint
    row.appendChild(note)
  }

  return { row, input }
}
