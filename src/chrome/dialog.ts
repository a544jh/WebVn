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

// A sentence, or a sentence with identifiers in it: `["Remove ", identifier("cliffs"), " from this
// project?"]`. The asset panel's dialogs name an id and the file behind it in one breath, and the
// two have to *look* like the two kinds of word they are - which `textContent` cannot do, and which
// `.vn-picker-identifier` already states as a rule for a row.
//
// Plain strings still work everywhere they did, so nothing that only has a sentence has to know this
// type exists.
export type DialogText = string | ReadonlyArray<string | Node>

// An identifier inside a sentence: an id, a filename, a path, a line a script would write. The
// chrome's own monospace, which is the face it gives an identifier everywhere else.
export const identifier = (text: string): HTMLElement => {
  const elem = document.createElement("span")
  elem.classList.add("vn-dialog-identifier")
  elem.textContent = text
  return elem
}

// Whatever a caller gave, put into an element. One place, so a hint, a paragraph and a problem
// message cannot come to accept different things.
const fill = (elem: HTMLElement, text: DialogText): void => {
  if (typeof text === "string") elem.textContent = text
  else elem.replaceChildren(...text)
}

export interface DialogOptions {
  readonly title: string
  // Paragraphs, in order. Say what will happen, and say what cannot be undone.
  readonly body?: DialogText[]
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
    fill(elem, paragraph)
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
export const noticeDialog = (title: string, body: DialogText[]): Promise<boolean> =>
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
  // **The directory**, which is what both callers are about to write into and what the folder below
  // names - not the id of the project being destroyed, which may disagree with it and is not what is
  // at stake. The two happen to be the same word in both callers, because a rename's destination is
  // the id its manifest declares and an import's is the id the archive's manifest declares.
  directory: string,
  folder: string,
  // The gerund of what is landing on it: "renaming", "importing".
  by: string,
  ...also: string[]
): Promise<boolean> =>
  confirmDestroyingProject(
    `Overwrite "${directory}"?`,
    `A project is already filed under ${folder}, and ${by} onto it destroys that project - its script, its manifest, every asset and its saves.`,
    "Overwrite",
    ...also
  )

// The common case: a question with no fields. Destructive by default, because that is what a
// confirmation is nearly always for here - deleting a project, overwriting one.
export const confirmDialog = (
  title: string,
  body: DialogText[],
  confirmLabel: string,
  destructive = true
): Promise<boolean> => openDialog({ title, body, confirmLabel, destructive })

// One labelled control with its own note underneath, which is the shape every field in this chrome
// takes. Returned rather than appended, so a caller lays its own form out.
export interface DialogRow<C extends HTMLElement> {
  readonly row: HTMLElement
  readonly control: C
  // Marks the field and replaces its note with the reason, or clears both. **Beside the field it
  // belongs to** - a validation message about an id has nowhere useful to go if it is not there,
  // which is the argument against `window.prompt` stated as a method.
  setProblem(message: string | null): void
  // Rewrite what the field says it is for. The `Add asset` dialog's hints quote the line a script
  // would write and the path a file will be stored at, so they change as the author types - and a
  // field has to remember its current hint anyway, because clearing a problem puts it back.
  setHint(hint: DialogText | undefined): void
}

// The text-input field, which is what both fields of the new-project dialog are. `input` is kept as
// well as `control` so the callers written before there was a second kind of field read unchanged.
export interface DialogField extends DialogRow<HTMLInputElement> {
  readonly input: HTMLInputElement
}

export const dialogField = (label: string, hint?: DialogText): DialogField => {
  const input = document.createElement("input")
  input.type = "text"
  input.classList.add("vn-dialog-input")
  const row = dialogRow(label, input, hint)
  return { ...row, input: row.control }
}

// **The select field, which is what made this a shape rather than a function.** `Add asset` asks
// what kind of asset a file is and which actor a sprite belongs to, and both are a choice from a
// list. The cheapest honest version swaps the control and keeps everything else - the 12px muted
// label above, the note below, the problem treatment - because the whole point of this surface is
// that a rule appears beside the field it is about, and a select that lost the note would lose it.
export const dialogSelect = (label: string, options: string[], hint?: DialogText): DialogRow<HTMLSelectElement> => {
  const select = document.createElement("select")
  select.classList.add("vn-dialog-input")
  for (const value of options) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = value
    select.appendChild(option)
  }
  return dialogRow(label, select, hint)
}

// The label, the control and the note, in that order. One function, because the two kinds of field
// differ by exactly one element and a second copy of the rest is the copy that drifts.
const dialogRow = <C extends HTMLElement>(label: string, control: C, hint?: DialogText): DialogRow<C> => {
  const row = document.createElement("label")
  row.classList.add("vn-dialog-field")

  const caption = document.createElement("span")
  caption.classList.add("vn-dialog-label")
  caption.textContent = label
  row.appendChild(caption)

  row.appendChild(control)

  // One element for both, because a field says either what it is for or what is wrong with it, and
  // never both at once: the problem is the more urgent answer to the same question.
  const note = document.createElement("span")
  note.classList.add("vn-dialog-hint")
  row.appendChild(note)

  let current = hint
  const show = (problem: string | null) => {
    control.classList.toggle("vn-dialog-input-problem", problem !== null)
    note.classList.toggle("vn-dialog-hint-problem", problem !== null)
    const text = problem ?? current ?? ""
    if (typeof text === "string") note.textContent = text
    else note.replaceChildren(...text)
    note.hidden = note.textContent === ""
    // Only once it is wrong, so a screen reader is not read the hint as an alert on every open.
    if (problem === null) note.removeAttribute("role")
    else note.setAttribute("role", "alert")
  }
  show(null)

  return {
    row,
    control,
    setProblem: show,
    setHint: (next) => {
      current = next
      // Only when nothing is wrong: a hint that overwrote a problem would take the complaint off the
      // field while the author is still looking at it.
      if (!note.classList.contains("vn-dialog-hint-problem")) show(null)
    },
  }
}
