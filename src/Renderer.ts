import { VnPlayerState } from "./core/state"

export interface Renderer {
  render: (state: VnPlayerState, animate: boolean) => void
  onRenderCallbacks: Array<() => void>
  onFinishedCallbacks: Array<() => void>
}