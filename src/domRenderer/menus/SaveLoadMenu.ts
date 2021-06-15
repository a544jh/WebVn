import { VnSaveSlotData } from "../../core/save"
import { DomRenderer } from "../DomRenderer"
import { pauseMenu } from "./PauseMenu"

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
    createNew.addEventListener("click", (e) => {
      renderer.closeMenu()
      renderer.saveToSlot(renderer.getSaves().length)
    })
    saveContainer.appendChild(createNew)
  }

  root.appendChild(saveContainer)
}

export function createSaveItem(
  save: VnSaveSlotData,
  slot: number,
  renderer: DomRenderer,
  saving: boolean
): HTMLDivElement {
  const saveDiv = document.createElement("div")
  saveDiv.classList.add("vn-pause-menu-item", "vn-save-item")

  saveDiv.innerText = new Date(save.timestamp).toISOString() + "\n" + save.path.join(" ")

  if (saving) {
    saveDiv.addEventListener("click", (e) => {
      // TODO need to implment own dialogs. this breaks fullscreen.
      const result = window.confirm("Are you sure you want to overwrite?")
      if (!result) return
      renderer.closeMenu()
      renderer.saveToSlot(slot)
    })
  } else {
    saveDiv.addEventListener("click", (e) => {
      const result = window.confirm("Are you sure you want to load?")
      if (!result) return
      renderer.loadFromSlot(slot)
      renderer.closeMenu()
    })
  }

  const delDiv = document.createElement("div")
  delDiv.innerText = "DEL"
  delDiv.classList.add("vn-save-del")
  delDiv.addEventListener("click", (e) => {
    e.stopPropagation()
    const result = window.confirm("Are you sure you want to delete the save?")
    if (!result) return
    renderer.deleteSave(slot)
    renderer.showMenu(saving ? saveMenu : loadMenu)
  })
  saveDiv.appendChild(delDiv)

  return saveDiv
}
