import { DomRenderer } from "../DomRenderer"
import { saveMenu, loadMenu } from "./SaveLoadMenu"

export function pauseMenu(root: HTMLDivElement, renderer: DomRenderer): void {
  const nowPlaying = nowPlayingElem(renderer)
  if (nowPlaying !== null) root.appendChild(nowPlaying)

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

// What is playing, as the manifest describes it. Both halves are already in reach: the committed
// state holds the bgm asset id, and `seedState` copied the declarations in beside it - so the menu
// looks a track up without holding a reference to the manifest.
//
// An id is a name for the author, not for the player, so an undeclared or untitled track shows
// nothing at all rather than its id.
function nowPlayingElem(renderer: DomRenderer): HTMLDivElement | null {
  const state = renderer.getCommittedState()
  const bgm = state?.animatableState.audio.bgm
  if (state === null || bgm === null || bgm === undefined) return null

  const title = state.audioAssets[bgm]?.title
  if (title === undefined) return null

  const elem = document.createElement("div")
  elem.classList.add("vn-now-playing")
  elem.appendChild(line("vn-now-playing-title", title))

  const artist = state.audioAssets[bgm].artist
  if (artist !== undefined) elem.appendChild(line("vn-now-playing-artist", artist))

  return elem
}

function line(className: string, text: string): HTMLDivElement {
  const elem = document.createElement("div")
  elem.classList.add(className)
  elem.innerText = text
  return elem
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
