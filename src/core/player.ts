import { NARRATOR_ACTOR_ID, State, VnPlayerState } from "./state"
import { VnPath } from "./vnPath"
import "./commands/controlFlow/Decision"
import "./commands/text/CloseTextBox"
import "./commands/controlFlow/variables"
import "./commands/sprites/Show"
import "./commands/sprites/Hide"
import "./commands/backgrounds/Background"
import "./commands/audio/Bgm"
import "./commands/audio/Sfx"

export const initialState: VnPlayerState = {
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white",
    },
    [NARRATOR_ACTOR_ID]: {},
  },
  backgrounds: [],
  audioAssets: [],
  commandIndex: 0, // the command to be applied next
  commands: [],
  labels: {},
  stopAfterRender: false,
  animatableState: {
    text: null,
    sprites: {},
    background: {
      image: "#FFFFFF",
      panDuration: 0,
      panFrom: { x: 0, y: 0, w: 0, h: 0 },
      panTo: { x: 0, y: 0, w: 0, h: 0 },
      waitForPan: false,
      transition: "fade",
      transitonDuration: 0,
      shouldTransition: false,
    },
    audio: {
      bgm: null,
      loopBgm: true,
      sfx: null,
    },
  },
  decision: null,
  variables: {},
}

export class VnPlayer {
  public state: VnPlayerState
  public path: VnPath
  public startingState: VnPlayerState

  constructor(state: VnPlayerState | undefined) {
    this.state = state === undefined ? initialState : state
    this.path = VnPath.emptyPath()
    this.startingState = this.state
  }

  public advance(): void {
    const newState = State.advance(this.state)
    if (this.state.stopAfterRender && newState !== this.state) {
      this.path = this.path.advance()
    }
    this.state = newState
  }

  public makeDecision(id: number): void {
    const newState = State.makeDecision(id, this.state)
    if (newState !== this.state) this.path = this.path.makeDecision(id)
    this.state = newState
  }

  public goToCommandDirect(cmdIndex: number): void {
    this.state = State.goToCommandDirect(cmdIndex, this.state)
    this.path = this.path.goToCommand(cmdIndex)
  }

  // TODO: goToCommandFromBeginning (i.e. breakpoints while editing) ?

  public undo(): void {
    this.path = this.path.undo(1)
    this.state = State.fromPath(this.startingState, this.path)
  }
}
