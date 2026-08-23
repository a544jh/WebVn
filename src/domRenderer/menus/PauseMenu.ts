import { DomRenderer } from "../DomRenderer"
import { saveMenu, loadMenu } from "./SaveLoadMenu"

export function pauseMenu(root: HTMLDivElement, renderer: DomRenderer): void {
  const container = document.createElement("div")
  container.classList.add("vn-pause-menu-container")

  container.appendChild(
    createItem("Return", () => {
      renderer.closeMenu()
    })
  )

  container.appendChild(
    createItem(
      "Save",
      () => {
        renderer.showMenu(saveMenu)
      },
      !renderer.canSave()
    )
  )

  container.appendChild(
    createItem("Load", () => {
      renderer.showMenu(loadMenu)
    })
  )

  root.appendChild(container)
}

// A disabled item gets no click listener at all, so it is inert rather than merely greyed out.
function createItem(text: string, action: () => void, disabled = false): HTMLDivElement {
  const elem = document.createElement("div")
  elem.setAttribute("role", "button")
  elem.classList.add("vn-pause-menu-item")
  if (disabled) {
    elem.classList.add("vn-pause-menu-item-disabled")
    elem.setAttribute("aria-disabled", "true")
  } else {
    elem.addEventListener("click", action)
  }
  elem.innerText = text
  return elem
}
