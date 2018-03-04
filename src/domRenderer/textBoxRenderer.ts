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
    const enterAnim: anime.AnimeParams = {
      targets: this.advTextBox,
      scaleY: [0, 1],
      easing: "linear",
      duration: 150,
    }

    if (!this.root.contains(this.advTextBox)) {
      this.root.appendChild(this.advTextBox)
      this.animationTimeline.add(enterAnim)
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

        const characterAnim: anime.AnimeParams = {
          targets: span,
          duration: 1,
          delay,
          opacity: [0, 1],
          easing: "linear",
          offset: 0,
        }

        this.animationTimeline.add(characterAnim)

        span.style.color = node.color

        this.advTextBox.appendChild(span)

        delay += node.characterDelay
      }
    })
  }

  private renderAdvNameTag(prevNameTag: ADVNameTag | undefined, nameTag: ADVNameTag | undefined) {

    const enterAnim: anime.AnimeParams = {
      targets: this.advNameTag,
      scaleY: [0, 1],
      easing: "linear",
      duration: 150,
    }

    const exitAnim: anime.AnimeParams = {
      ...enterAnim,
      scaleY: [1, 0],
    }

    if (prevNameTag === nameTag) {
      return
    }

    if (nameTag === undefined) {
      if (this.root.contains(this.advNameTag)) {
        this.animationTimeline.add({
          ...exitAnim,
          complete: () => {
            this.root.removeChild(this.advNameTag)
          },
        })
      }
      return
    }
    if (!this.root.contains(this.advNameTag)) {
      this.root.appendChild(this.advNameTag)
    }

    if (prevNameTag === undefined) {
      this.advNameTag.textContent = nameTag.name
      this.advNameTag.style.color = nameTag.color
      this.animationTimeline.add(enterAnim)

    } else if (prevNameTag.name !== nameTag.name) {

      this.animationTimeline.add({
        ...exitAnim,
        complete: () => {
          this.advNameTag.textContent = nameTag.name
          this.advNameTag.style.color = nameTag.color
        },
      }).add(enterAnim)
    }
  }
}
