import { initialState, VnPlayer } from "./core/player"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "./core/state"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import "./index.html"

import "codemirror/lib/codemirror.css"

import { YamlParser } from "./yamlParser/YamlParser"
import { loadFromLocalStorage } from "./core/save"
import toReadableStream from "to-readable-stream"
import { Base64 } from "js-base64"

const state: VnPlayerState = {
  ...initialState,
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white",
    },
    [NARRATOR_ACTOR_ID]: {
      textColor: "#60baff",
    },
    Anthony: {
      name: "Anthony",
      nameTagColor: "orange",
      sprites: [],
    },
  },
  backgrounds: ["scene1.webp", "scene2.webp", "scene3.webp", "scene4.webp"],
  audioAssets: ["bgm/The Ant and the Fridge.ogg", "sfx/bigthump.ogg"],
}

const yamlText = `
story:

  - bg:
      image: "#000000"
      transition: fade
      duration: 0

  - The Ant and the Refrigerator

  - "Act 1 - The Lighthouse"

  - bgm: "bgm/The Ant and the Fridge.ogg"

  - bg:
        image: scene1.webp
        transition: blinds
        duration: 2000
        pan:
          from: [903,108,637,364]
          to: [0,0,1792,1024]
          duration: 4000

  - Anthony: "The golden light of the setting sun casts its warm glow over our colony. The others scurry about, obsessed with their endless work. Crumbs, twigs, leaves—it’s all so… mundane."
  - Anthony: "But I am different. I am destined for something greater. Do they not feel it? The earth trembles beneath us, the winds whisper of adventure!"
  - Anthony: "Fine, laugh at me. But one day, they’ll see."

  - bg:
      image: "#000000"
      transition: blinds
      duration: 2000

  - "Act 2 - The Arrival"

  - bg:
          image: scene2.webp
          transition: blinds
          duration: 2000
          pan:
            from: [113,626,684,391]
            to: [0,0,1792,1024]
            duration: 4000

  - sfx: "sfx/bigthump.ogg"
  - Anthony: "What’s that? A low rumble… growing stronger…"
  - A gleaming refrigerator appears, being dragged awkwardly on a wagon. Its surface sparkles in the moonlight.
  - Anthony: "By the stars! What is this? A metallic monolith… a celestial being!"
  - Anthony: "Could it be a gift from the heavens? A challenge to prove my worth?"
  - Anthony: "Yes. This is my destiny."

  - bg:
        image: "#000000"
        transition: blinds
        duration: 2000

  - "Act 3 - The Pursuit"

  - bg:
          image: scene3.webp
          transition: blinds
          duration: 2000
          pan:
            from: [76,299,856,489]
            to: [0,0,1792,1024]
            duration: 4000

  - The wagon shifts, and the refrigerator begins to roll toward the cliff. Antony stumbles.
  - Anthony: "No! Stop, great one! I won’t let you fall!"
  - Anthony starts chasing the refrigerator, the cliff edge growing closer with every second.
  - Anthony: "If I must risk everything to save you, so be it!"
  - The refrigerator hits a rock and flies off the wagon. Time slows as Antony leaps, grabbing the fridge’s corner as they both plummet over the cliff.

  - bg:
      image: "#000000"
      transition: blinds
      duration: 2000

  - "Act 4 - The Fall"

  - bg:
          image: scene4.webp
          transition: blinds
          duration: 2000
          pan:
            from: [692,258,873,499]
            to: [0,0,1792,1024]
            duration: 4000

  - Anthony: "We’ve made it… You’re safe now, my friend."
  - The lighthouse keeper approaches. He inspects the fridge, discovering a complex system of tunnels carved into the frost. Antony watches him from a high shelf inside the fridge.
  - Anthony: "This is my new home. My throne. Together, we will stand as guardians of this lighthouse, watching over the world."
  - The lighthouse keeper chuckles and closes the fridge door.

  - bg:
      image: "#000000"
      transition: fade
      duration: 2000

  - "Antony’s dramatic heart found its purpose. The refrigerator became both his sanctuary and his partner in destiny. Together, they stood watch at the edge of the world. The End."
`

const [yamlState] = YamlParser.updateState(yamlText, state)
// TODO: id from VN title
let save
try {
  save = loadFromLocalStorage("test")
} catch (e) {
  save = undefined
}
const player = new VnPlayer(yamlState, save)

declare global {
  interface Window {
    vnPlayer: VnPlayer
    vnDomRenderer: DomRenderer
  }
}

window.vnPlayer = player

const vnDivContainer = document.getElementById("vn-div-container") as HTMLDivElement
const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const renderer = new DomRenderer(vnDiv, player)
window.vnDomRenderer = renderer

const vnEditorDiv = document.getElementById("vn-editor") as HTMLDivElement
const editor = new VnEditor(vnEditorDiv, player, YamlParser, renderer)

const vnStateDiv = document.getElementById("vn-state") as HTMLDivElement
renderer.onRenderCallbacks.push(() => {
  // vnStateDiv.textContent = JSON.stringify(player.state, null, 2)
})

const vnVarsDiv = document.getElementById("vn-variables")
const varHeader = document.createElement("h4")
varHeader.innerText = "Variables"
vnVarsDiv?.appendChild(varHeader)
const varsContainer = document.createElement("div")
vnVarsDiv?.appendChild(varsContainer)

renderer.onRenderCallbacks.push(() => {
  varsContainer.innerHTML = ""
  let text = ""
  for (const variable in player.state.variables) {
    text += `${variable} = ${JSON.stringify(player.state.variables[variable])}\n`
  }
  text += `Seen commands: ${JSON.stringify(player.state.seenCommands.toJSON())}\n`
  varsContainer.innerText = text
})

document.getElementById("vn-btn-fullscreen")?.addEventListener("click", () => {
  document
    .getElementById("vn-div-container")
    ?.requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      screen.orientation.lock("landscape")
      window.setTimeout(setScale, 500)
    }) // hackety hack to let mobile ui settle..
})

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement === null) {
    restoreOnFullscreenExit()
  }
})

editor.loadScript(yamlText)

// TODO move to DomRenderer
function setScale() {
  const containerWidth = vnDivContainer.clientWidth // width of screen in css pixels
  const vnWidth = vnDiv.clientWidth
  const containerHeight = vnDivContainer.clientHeight
  const vnHeight = vnDiv.clientHeight

  let scale
  // if screen is wider than vn aspect ratio
  if (containerWidth / containerHeight > vnWidth / vnHeight) {
    scale = containerHeight / vnHeight
    vnDivContainer.style.paddingLeft = (containerWidth - vnWidth * scale) / 2 + "px"
  } else {
    scale = containerWidth / vnWidth
    vnDivContainer.style.paddingTop = (containerHeight - vnHeight * scale) / 2 + "px"
  }
  const transform = `scale(${scale})`
  vnDiv.style.margin = "initial"
  vnDiv.style.transform = transform
  vnDiv.style.transformOrigin = "top left"
}

function restoreOnFullscreenExit() {
  vnDivContainer.style.paddingLeft = ""
  vnDivContainer.style.paddingTop = ""
  vnDiv.style.margin = ""
  vnDiv.style.transform = ""
  vnDiv.style.transformOrigin = ""
}

document.getElementById("vn-btn-export-url")?.addEventListener("click", getCompressedScript)

async function getCompressedScript() {
  const script = editor.getScript()
  const stringStream = toReadableStream(new TextEncoder().encode(script))
  const compressedStream = stringStream.pipeThrough(new CompressionStream("gzip"))
  const ab = await new Response(compressedStream).arrayBuffer()
  const base64 = Base64.fromUint8Array(new Uint8Array(ab), true)
  console.log(base64)
  return base64
}