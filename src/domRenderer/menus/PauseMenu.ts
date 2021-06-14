import { DomRenderer } from "../DomRenderer"

export function pauseMenu(root: HTMLDivElement, renderer: DomRenderer): void {
  const container = document.createElement("div")
  container.classList.add("vn-pause-menu-container")

  container.appendChild(
    createItem("Return", () => {
      renderer.closeMenu()
    })
  )

  container.appendChild(
    createItem("Save", () => {
      undefined
    })
  )

  container.appendChild(
    createItem("Load", () => {
      undefined
    })
  )

  root.appendChild(container)
}

function createItem(text: string, action: () => void): HTMLDivElement {
  const elem = document.createElement("div")
  elem.setAttribute("role", "button")
  elem.classList.add("vn-pause-menu-item")
  elem.innerText = text
  elem.addEventListener("click", action)
  return elem
}
