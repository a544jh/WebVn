import { TextBoxType, VnPlayerState } from "./state"

const initialState: VnPlayerState = {
  commands : [],
  animatableState: {
    text: null,
  },
}

export class VnPlayer {
  public state: VnPlayerState
  constructor(state: VnPlayerState | undefined) {
    this.state = state === undefined ? initialState : state
  }

  public advance() {
    this.state = this.state
  }
}
