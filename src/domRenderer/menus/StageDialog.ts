// The stage's own dialog: one translucent box holding the text, and one box per answer below it. It
// asks the three save confirms and shows the loop guard's error.
//
// It exists because a browser `confirm()` or `alert()` leaves fullscreen, which on a phone throws the
// reader out of it just for answering. This is drawn inside the vn root instead - in the open menu, by
// DomRenderer.ask, which owns when one is up and what backs out of it - so it goes fullscreen with the
// story.
//
// Not src/chrome/dialog.ts, and not that module's class names. That one is the authoring tool's,
// styled by --vn-editor-*, and the editor puts both on one page. This one is the story's, styled by
// --vn-*, so a theme restyles it with the rest of the stage.

export interface StageDialogAnswer {
  label: string
  // Greyed out and given no listener, as a disabled pause menu item is.
  disabled?: boolean
}

export interface StageDialogSpec {
  title: string
  // What the question is about, between the title and the line: the save slot a confirm is asking
  // about, repeated because its row is hidden while the question is up.
  detail?: HTMLElement
  line: string
  // In the order they are drawn, left to right. `onAnswer` is told the index.
  answers: StageDialogAnswer[]
}

export function createStageDialog(spec: StageDialogSpec, onAnswer: (index: number) => void): HTMLDivElement {
  const text = element("vn-stage-dialog-text")
  text.append(element("vn-stage-dialog-title", spec.title))
  if (spec.detail !== undefined) text.append(spec.detail)
  text.append(element("vn-stage-dialog-line", spec.line))

  const answers = element("vn-stage-dialog-answers")
  spec.answers.forEach((answer, index) => {
    const elem = element("vn-stage-dialog-answer", answer.label)
    elem.setAttribute("role", "button")
    if (answer.disabled === true) {
      elem.classList.add("vn-stage-dialog-answer-disabled")
      elem.setAttribute("aria-disabled", "true")
    } else {
      elem.addEventListener("click", () => onAnswer(index))
    }
    answers.append(elem)
  })

  const boxes = element("vn-stage-dialog-boxes")
  boxes.append(text, answers)

  const dialog = element("vn-stage-dialog")
  dialog.setAttribute("role", "dialog")
  dialog.setAttribute("aria-modal", "true")
  dialog.append(boxes)
  return dialog
}

function element(className: string, text?: string): HTMLDivElement {
  const elem = document.createElement("div")
  elem.classList.add(className)
  if (text !== undefined) elem.innerText = text
  return elem
}
