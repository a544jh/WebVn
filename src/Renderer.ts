import { DeclaredAsset } from "./core/manifest"
import { VnPlayerState } from "./core/state"

export interface Renderer {
  render: (animate: boolean) => void
  // Swap in a story and play it to its first stop. The swap and the render have to happen in one
  // synchronous step - see DomRenderer.loadStory.
  loadStory: (state: VnPlayerState, animate: boolean) => void
  onRenderCallbacks: Array<() => void>
  onFinishedCallbacks: Array<() => void>
  // Resolves with the declarations whose file could not be loaded - see DomRenderer.loadAssets.
  loadAssets(state?: VnPlayerState): Promise<DeclaredAsset[]>
}
