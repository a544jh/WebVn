import * as React from "react"
import { VnPlayerState } from "../core/state"
import { TextBox } from "./TextBox"
import { VnPlayer } from "../core/player"

interface Props {
  playerState: VnPlayerState,
  onClick: React.MouseEventHandler
  onScroll: React.WheelEventHandler
}

export class VnRoot extends React.Component<Props> {
  public render() {
    const animState = this.props.playerState.animatableState
    return (
      <div id="vn-div" onClick={this.props.onClick} onWheel={this.props.onScroll}>
        {animState.text !== null ?
          <TextBox adv={animState.text} /> : null}
      </div>
    )
  }
}
