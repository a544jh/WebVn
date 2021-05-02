export interface Renderer {
  render: (animate: boolean) => void
  onRenderCallbacks: Array<() => void>
  onFinishedCallbacks: Array<() => void>
  loadAssets(): Promise<void[]>
}
