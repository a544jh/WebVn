import { VnSaveSlotData } from "../../core/save"
import { IncompatibleSaveError } from "../../core/state"
import { DomRenderer } from "../DomRenderer"
import { pauseMenu } from "./PauseMenu"
import { StageDialogAnswer } from "./StageDialog"

export function saveMenu(root: HTMLDivElement, renderer: DomRenderer): void {
  return saveLoadMenu(root, renderer, true)
}

export function loadMenu(root: HTMLDivElement, renderer: DomRenderer): void {
  return saveLoadMenu(root, renderer, false)
}

function saveLoadMenu(root: HTMLDivElement, renderer: DomRenderer, saving: boolean): void {
  const heading = document.createElement("div")
  heading.innerText = saving ? "Save" : "Load"
  heading.classList.add("vn-save-heading")
  root.appendChild(heading)

  const saveContainer = document.createElement("div")
  saveContainer.classList.add("vn-saves-container")

  const returnDiv = document.createElement("div")
  returnDiv.classList.add("vn-pause-menu-item", "vn-save-return")
  returnDiv.innerText = "Return"
  returnDiv.addEventListener("click", () => {
    renderer.showMenu(pauseMenu) // TODO might have to return to some other menu too.. (eg. title)
  })
  root.appendChild(returnDiv)

  renderer.getSaves().forEach((save, slot) => {
    const saveDiv = createSaveItem(save, slot, renderer, saving)
    saveContainer.appendChild(saveDiv)
  })

  if (saving) {
    const createNew = document.createElement("div")
    createNew.classList.add("vn-pause-menu-item", "vn-save-item", "vn-save-new")
    createNew.innerText = "Create new"
    createNew.addEventListener("click", () => {
      renderer.closeMenu()
      renderer.saveToSlot(renderer.getSaves().length)
    })
    saveContainer.appendChild(createNew)
  }

  root.appendChild(saveContainer)
}

// Every confirm answers Cancel on the left and the act on the right, the order the chrome's dialogs
// use, so the act is always answer 1.
const ACT = 1
const answers = (act: string): StageDialogAnswer[] => [{ label: "Cancel" }, { label: act }]

// A save that will not load - an incompatible save - says so in the reader's words, which name
// neither a version nor a path. True whichever way the script moved under the save.
const INCOMPATIBLE_NOTE = ["The story has changed since this save.", "It cannot be loaded."]

// What a slot is labelled: when it was saved, and its raw path. Engine internals shown to a reader,
// and left as they were by the change that made the rest of this menu - what a slot says is its own
// question.
function slotLabel(save: VnSaveSlotData): HTMLDivElement {
  const label = document.createElement("div")
  label.classList.add("vn-save-label")
  label.innerText = new Date(save.timestamp).toISOString() + "\n" + save.path.join(" ")
  return label
}

function incompatibleNote(): HTMLDivElement {
  const note = document.createElement("div")
  note.classList.add("vn-save-note")
  note.innerText = INCOMPATIBLE_NOTE.join("\n")
  return note
}

// The slot a confirm is asking about, repeated in its text box: the row itself is hidden while the
// question is up, and may have been scrolled away. At full strength even when the save will not load,
// because it is there to say WHICH save is meant.
function slotDetail(save: VnSaveSlotData, incompatible: boolean): HTMLDivElement {
  const detail = document.createElement("div")
  detail.classList.add("vn-stage-dialog-slot")
  detail.append(slotLabel(save))
  if (incompatible) detail.append(incompatibleNote())
  return detail
}

// One row of either menu. Whether its save still loads is asked when the row is drawn - a trial
// replay per slot, which is what lets Load draw a dead save inert rather than leave the reader to
// discover it. Save asks too: the note is how a reader picks which slot to spend, and overwriting a
// save that will not load is a perfectly good use of it, so there the row stays live.
export function createSaveItem(
  save: VnSaveSlotData,
  slot: number,
  renderer: DomRenderer,
  saving: boolean
): HTMLDivElement {
  const incompatible = !renderer.canLoadFromSlot(slot)
  const inert = incompatible && !saving

  const saveDiv = document.createElement("div")
  saveDiv.classList.add("vn-pause-menu-item", "vn-save-item")
  saveDiv.append(slotLabel(save))
  if (incompatible) {
    saveDiv.classList.add("vn-save-item-incompatible")
    saveDiv.append(incompatibleNote())
  }
  if (inert) {
    // No listener, as a disabled pause menu item has none - and no button role either, rather than a
    // disabled one: aria-disabled carries down to the delete inside it, which is live.
    saveDiv.classList.add("vn-save-item-inert")
  } else {
    saveDiv.setAttribute("role", "button")
  }

  if (saving) {
    saveDiv.addEventListener("click", () => {
      void renderer
        .ask({
          title: "Overwrite this save?",
          detail: slotDetail(save, incompatible),
          line: "This cannot be undone.",
          answers: answers("Overwrite"),
        })
        .then((answer) => {
          if (answer !== ACT) return
          renderer.closeMenu()
          renderer.saveToSlot(slot)
        })
    })
  } else if (!inert) {
    saveDiv.addEventListener("click", () => {
      void renderer
        .ask({
          title: "Load this save?",
          detail: slotDetail(save, false),
          line: "Unsaved progress will be lost.",
          answers: answers("Load"),
        })
        .then((answer) => {
          if (answer !== ACT) return
          try {
            renderer.loadFromSlot(slot)
          } catch (e) {
            if (!(e instanceof IncompatibleSaveError)) throw e
            // The answer this row was drawn with went stale: in the editor, adopting the manifest
            // and a gutter click both reload the story under an open menu. The refused load left the
            // player where it was, so the row is redrawn the way it would be drawn now.
            saveDiv.replaceWith(createSaveItem(save, slot, renderer, saving))
            return
          }
          renderer.closeMenu()
        })
    })
  }

  // Live on every row, the inert one included: on a save that will not load, deleting it is the one
  // useful thing left to do.
  const delDiv = document.createElement("div")
  delDiv.innerText = "DEL"
  delDiv.classList.add("vn-save-del")
  delDiv.setAttribute("role", "button")
  delDiv.addEventListener("click", (e) => {
    e.stopPropagation()
    void renderer
      .ask({
        title: "Delete this save?",
        detail: slotDetail(save, incompatible),
        line: "This cannot be undone.",
        answers: answers("Delete"),
      })
      .then((answer) => {
        if (answer !== ACT) return
        renderer.deleteSave(slot)
        renderer.showMenu(saving ? saveMenu : loadMenu)
      })
  })
  saveDiv.appendChild(delDiv)

  return saveDiv
}
