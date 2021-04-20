import * as React from "react"
import { ADVNameTag, ADVTextBox } from "../core/state"
import { getUniqueId } from "./reactRenderer"
import { CSSTransition, SwitchTransition, Transition } from "react-transition-group"

interface Props {
  adv: ADVTextBox
  animate: boolean
  onAnimationFinished: () => void
}

export class TextBox extends React.Component<Props, Record<string, never>> {
  public render(): JSX.Element {
    const { adv } = this.props
    const charSpans: JSX.Element[] = []

    let delay = 0

    adv.textNodes.forEach((node, index) => {
      const text = node.text

      for (let i = 0; i < text.length; i++) {
        const style: React.CSSProperties = {}
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

        charSpans.push(
          <span key={getUniqueId()} style={style} onAnimationEnd={finishedFn}>
            {text.charAt(i)}
          </span>
        )
      }
    })

    return (
      <div id="vn-textbox-renderer">
        <NameTag nameTag={adv.nameTag} animate={this.props.animate} />
        <div className="vn-adv-textbox">{charSpans}</div>
      </div>
    )
  }
}

type NameTagProps = {
  nameTag?: ADVNameTag
  animate: boolean
}

const transitionStyles: Record<string, React.CSSProperties> = {
  entering: { transform: "scaleY(1)" },
  entered: { transform: "scaleY(1)" },
  exiting: { transform: "scaleY(0.0001)" },
  exited: { transform: "scaleY(0.0001)" },
}

const NameTag = (props: NameTagProps): JSX.Element | null => {
  const isIn = props.nameTag !== undefined
  console.log(isIn)
  return (
    <SwitchTransition>
      <CSSTransition
        key={JSON.stringify(props.nameTag) || "null"}
        classNames="vn-adv-nametag"
        //in={isIn}
        appear={true}
        //mountOnEnter={true}
        //unmountOnExit={true}
        addEndListener={(node, done) => {
          node.addEventListener("transitionend", done, false)
        }}
      >
        {(state) => (
          <div className="vn-adv-nametag" style={{ color: props.nameTag?.color, ...transitionStyles[state] }}>
            {props.nameTag?.name}
          </div>
        )}
      </CSSTransition>
    </SwitchTransition>
  )
}
