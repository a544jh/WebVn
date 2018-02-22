import { VnPlayerState, TextBoxType } from "./state"

const initialState: VnPlayerState = {
  commands : [],
  animatableState: {
    text: null
  }
}

export class VnPlayer {
  state: VnPlayerState
  constructor() {
    this.state = initialState
  }
}