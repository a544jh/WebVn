import * as React from "react"
import { ADVTextBox } from "../core/state";

export class TextBox extends React.Component<{ adv: ADVTextBox }, {}> {
  public render() {
    const { adv } = this.props
    const charSpans: JSX.Element[] = [];

    adv.textNodes.forEach((node, index) => {
      const text = node.text
      for (let i = 0; i < text.length; i++) {
        charSpans.push(<span key={i}>{text.charAt(i)}</span>)
      }
    })

    return (
      <div id="vn-textbox-renderer" className="vn-adv-textbox" >
        {charSpans}
      </div>
    )
  }
}
