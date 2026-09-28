import { VnPlayer } from "./core/player"
import { DomRenderer } from "./domRenderer/DomRenderer"
import "./player.html"

import { bootPlayer, pageFolder } from "./playerBoot"

declare global {
  interface Window {
    vnPlayer: VnPlayer
    vnDomRenderer: DomRenderer
  }
}

const vnDivContainer = document.getElementById("vn-div-container") as HTMLDivElement
const vnDiv = document.getElementById("vn-div") as HTMLDivElement

// Wiring only: what the player plays, and every refusal, is src/playerBoot.ts's - where a suite can
// reach it. With no `?vn=` that is the published folder this page is served from, which for the
// deployed demo is `dist/`.
bootPlayer({
  root: vnDiv,
  container: vnDivContainer,
  folder: pageFolder(location.href),
  payload: new URLSearchParams(location.search).get("vn"),
})
  .then((booted) => {
    if (booted.kind === "refused") {
      showLoadError(booted.reason, booted.details)
      return
    }
    window.vnPlayer = booted.player
    window.vnDomRenderer = booted.renderer
    // The button is page chrome rather than part of the vn, so the wiring stays here and the
    // mechanism lives in the renderer. Wired only once there is a renderer - on the error path there
    // is no scene to scale.
    document.getElementById("vn-btn-fullscreen")?.addEventListener("click", () => booted.renderer.enterFullscreen())
  })
  .catch((e) => showLoadError("The VN could not be loaded.", e))

// The player's first and only error surface. A blank stage is indistinguishable from a bug, and a
// refused story is a dead end rather than a degraded render, so it says so - one unstyled line. A
// styled error screen belongs to `.scratch/stage-dialogs/`.
function showLoadError(reason: string, details: unknown): void {
  if (details !== undefined) console.error(details)
  const message = document.createElement("p")
  message.textContent = reason
  vnDiv.appendChild(message)
}
