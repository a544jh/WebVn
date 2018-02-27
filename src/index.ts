import "./index.html";

import { VnPlayer } from "./core/player";
import { VnPlayerState, TextBoxType } from "./core/state";
import { DomRenderer } from "./domRenderer/domRenderer";
import { CommandType } from "./core/commands";

const state: VnPlayerState = {
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white"
    },
    none: {
      textColor: "#60baff"
    }
  },
  commandIndex: 0,
  commands: [
    {
      type: CommandType.ADV,
      text: "Hello from WebVn!"
    },
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
        {
          text:
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras sit amet ligula ac turpis viverra pretium ut at metus. Etiam condimentum sed eros in tincidunt. Mauris feugiat vel tortor sit amet bibendum. Maecenas sit amet sapien tellus.",
          characterDelay: 20,
          color: "black"
        }
      ]
    }
  }
};

const vnPlayer = new VnPlayer(state);

const vnDiv = document.getElementById("vn_div") as HTMLDivElement;
const renderer = new DomRenderer(vnDiv, vnPlayer);

const vnStateDiv = document.getElementById("vn_state") as HTMLDivElement;
vnStateDiv.style.whiteSpace = "pre";

renderer.render(vnPlayer.state);
vnStateDiv.textContent = JSON.stringify(vnPlayer.state, null, 2);

const advance = () => {
  vnPlayer.advance();
  renderer.render(vnPlayer.state);
  vnStateDiv.textContent = JSON.stringify(vnPlayer.state, null, 2);
}

const advanceBtn = document.getElementById("vn_advance") as HTMLButtonElement;
advanceBtn.addEventListener("click", advance);

vnDiv.addEventListener("click", advance)