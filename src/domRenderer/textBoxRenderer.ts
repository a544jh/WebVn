import * as anime from "animejs"
import { ADVNameTag, ADVTextBox, TextBox, TextBoxType, VnPlayerState } from "../core/state"

export class TextBoxRenderer {

  private root: HTMLDivElement
  private advTextBox: HTMLDivElement
  private advNameTag: HTMLDivElement
  private animationTimeline: anime.AnimeTimelineInstance

  constructor(vnRoot: HTMLDivElement) {
    this.root = document.createElement("div")
    this.root.id = "vn-textbox-renderer"
    vnRoot.appendChild(this.root)

    this.advTextBox = document.createElement("div")
    this.advTextBox.classList.add("vn-adv-textbox")

    this.advNameTag = document.createElement("div")
    this.advNameTag.classList.add("vn-adv-nametag")

    this.animationTimeline = anime.timeline()
  }

  public render(prevText: TextBox | null, text: TextBox | null, animate: boolean): Promise<void> {

    if (prevText === text) {
      // lol diffing
      if (!animate) {this.animationTimeline.seek(Number.MAX_VALUE)}
      return Promise.resolve()
    }

    this.animationTimeline = anime.timeline()

    if (text === null) {
      // TODO: exit animation...
      this.root.removeChild(this.advTextBox)
      return this.animationTimeline.finished
    }

    // maybe use dict to lookup, or class instance method....
    switch (text.type) {
      case TextBoxType.ADV:
      this.renderAdv(prevText, text as ADVTextBox)
      break
    }

    if (!animate) {this.animationTimeline.seek(Number.MAX_VALUE)}

    return this.animationTimeline.finished
  }

  private renderAdv(prevAdv: ADVTextBox | null, adv: ADVTextBox) {
    const enterKeyframes: AnimationKeyFrame[] = [
      {transform: "scaleY(0)"},
      {transform: "scaleY(1)"},
    ]

    const exitKeyframes: AnimationKeyFrame[] = [
      {transform: "scaleY(1)"},
      {transform: "scaleY(0)"},
    ]

    const timing: AnimationEffectTiming = {
      duration: 150,
      easing: "linear",
    }

    if (!this.root.contains(this.advTextBox)) {
      this.root.appendChild(this.advTextBox)
      this.advTextBox.animate(enterKeyframes, timing)
    }

    const prevNameTag = (prevAdv === null ? undefined : prevAdv.nameTag)
    this.renderAdvNameTag(prevNameTag, adv.nameTag)

    this.advTextBox.innerHTML = ""

    let delay = 0

    adv.textNodes.forEach((node, index) => {
      const text = node.text

      for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span")
        span.innerText = text.charAt(i)

        const keyframes: AnimationKeyFrame = {
          opacity: [0, 1],
        }

        const charTiming: AnimationEffectTiming = {
          delay,
          easing: "linear",
          duration: 1,
        }

        span.style.color = node.color
        span.style.opacity = "0"
        span.animate(keyframes, charTiming).onfinish = () => {
          span.style.opacity = ""
        }
        this.advTextBox.appendChild(span)

        delay += node.characterDelay
      }
    })
  }

  private renderAdvNameTag(prevNameTag: ADVNameTag | undefined, nameTag: ADVNameTag | undefined) {

    const enterKeyframes: AnimationKeyFrame[] = [
      {transform: "scaleY(0)"},
      {transform: "scaleY(1)"},
    ]

    const exitKeyframes: AnimationKeyFrame[] = [
      {transform: "scaleY(1)"},
      {transform: "scaleY(0)"},
    ]

    const timing: AnimationEffectTiming = {
      duration: 150,
      easing: "linear",
    }

    if (prevNameTag === nameTag) {
      return
    }

    if (nameTag === undefined) {
      if (this.root.contains(this.advNameTag)) {
        this.advNameTag.animate(exitKeyframes, timing).onfinish = () => {
          this.root.removeChild(this.advNameTag)
        }
      }
      return
    }
    if (!this.root.contains(this.advNameTag)) {
      this.root.appendChild(this.advNameTag)
    }

    if (prevNameTag === undefined) {
      this.advNameTag.textContent = nameTag.name
      this.advNameTag.style.color = nameTag.color
      this.advNameTag.animate(enterKeyframes, timing)

    } else if (prevNameTag.name !== nameTag.name) {

      this.advNameTag.animate(exitKeyframes, timing).onfinish = () => {
        this.advNameTag.textContent = nameTag.name
        this.advNameTag.style.color = nameTag.color
        this.advNameTag.animate(enterKeyframes, timing)
      }
    }
  }
}
