import './index.html';
import { VnPlayer } from './core/player';
import { VnPlayerState, TextBoxType } from './core/state';
import { DomRenderer } from './domRenderer/domRenderer';
import { CommandType } from './core/commands';


const state: VnPlayerState = {
  commandIndex: 0,
  commands : [
    {
      type: CommandType.ADV,
      text: "A fast visual novel toolkit"
    },
    {
      type: CommandType.ADV,
      text: "For the Web"
    }
  ],
  animatableState: {
    text: {
      type: TextBoxType.ADV,
      textNodes: [
        {text: "Hello from WebVn!", characterDelay: 20, color: "black"}
      ]
    },
  },
}

const vnPlayer = new VnPlayer(state)

const vnDiv = document.getElementById("vn_div")
const renderer = new DomRenderer(vnDiv as HTMLElement, vnPlayer)

const vnStateDiv = document.getElementById("vn_state") as HTMLDivElement
vnStateDiv.style.whiteSpace = "pre"

renderer.render(vnPlayer.state)
vnStateDiv.textContent = JSON.stringify(vnPlayer.state, null, 2)

const advanceBtn = document.getElementById("vn_advance") as HTMLButtonElement
advanceBtn.addEventListener("click", () => {
  vnPlayer.advance()
  renderer.render(vnPlayer.state)
  vnStateDiv.textContent = JSON.stringify(vnPlayer.state, null, 2)
})