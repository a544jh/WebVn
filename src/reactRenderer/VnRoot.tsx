import * as React from "react"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { TextBox } from "./TextBox"

interface Props {
  playerState: VnPlayerState
  animate: boolean
  onAnimationFinished: () => void
  onClick: React.MouseEventHandler
  onScroll: React.WheelEventHandler
}

export class VnRoot extends React.Component<Props> {
  public render(): JSX.Element {
    const animState = this.props.playerState.animatableState
    const textBox =
      animState.text !== null ? (
        <TextBox
          adv={animState.text}
          animate={this.props.animate}
          onAnimationFinished={this.props.onAnimationFinished}
        />
      ) : null
    return (
      <div id="vn-div" onClick={this.props.onClick} onWheel={this.props.onScroll}>
        {textBox}
      </div>
    )
  }
}
