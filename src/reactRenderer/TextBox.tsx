import * as React from "react"
import { ADVTextBox } from "../core/state"
import { getUniqueId } from "./reactRenderer"

interface Props {
  adv: ADVTextBox
  animate: boolean
  onAnimationFinished: () => void
}

export class TextBox extends React.Component<Props, {}> {
  public render() {
    const { adv } = this.props
    const charSpans: JSX.Element[] = []

    let delay = 0

    adv.textNodes.forEach((node, index) => {
      const text = node.text

      for (let i = 0; i < text.length; i++) {
        const style: any = {}
        let finishedFn

        if (this.props.animate) {
          style.animation = "appear"
          style.animationTimingFunction = "step-end"
          style.animationDuration = delay + "ms"
          if (i === text.length - 1) {
            finishedFn = this.props.onAnimationFinished
          }
        }

        style.color = node.color
        delay += node.characterDelay

        charSpans.push(<span key={getUniqueId()} style={style} onAnimationEnd={finishedFn}>{text.charAt(i)}</span>)
      }
    })

    return (
      <div id="vn-textbox-renderer" className="vn-adv-textbox" >
        {charSpans}
      </div>
    )
  }
}
