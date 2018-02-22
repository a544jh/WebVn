import './index.html';
import { VnPlayer } from './core/player';
import { VnPlayerState, TextBoxType } from './core/state';
import { DomRenderer } from './domRenderer/domRenderer';


const state: VnPlayerState = {
  commands : [],
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

document.write(JSON.stringify(vnPlayer.state))

renderer.render(state)