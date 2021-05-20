export abstract class Renderable {
  constructor(protected startTime: number, protected duration: number) {}

  render(target: CanvasRenderingContext2D, time: number): boolean {
    let completion = (time - this.startTime) / this.duration
    if (completion > 1) {
      completion = 1
      this.animationFinished()
    }
    return this.renderFrame(target, completion, time) // needsMoreFrames
  }

  abstract renderFrame(target: CanvasRenderingContext2D, completion: number, time: number): boolean

  private onFinishCallbacks: (() => void)[] = []
  public onFinish(cb: () => void): void {
    this.onFinishCallbacks.push(cb)
  }
  private finished = false

  protected animationFinished(): void {
    if (this.finished) return
    this.finished = true
    for (const cb of this.onFinishCallbacks) {
      cb()
    }
  }
}
