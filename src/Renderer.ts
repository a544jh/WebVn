import { DeclaredAsset } from "./core/manifest"
import { VnPlayerState } from "./core/state"

export interface Renderer {
  render: (animate: boolean) => void
  // Swap in a story and play it to its first stop. The swap and the render have to happen in one
  // synchronous step - see DomRenderer.loadStory.
  loadStory: (state: VnPlayerState, animate: boolean) => void
  onRenderCallbacks: Array<() => void>
  onFinishedCallbacks: Array<() => void>
  // The loop guard stopped the story: told the index of the jump that closes the loop, for the editor
  // to mark, or null if it could not be found. The reader is told on the stage - see
  // DomRenderer.showLoopError.
  onLoopCallbacks: Array<(jumpIndex: number | null) => void>
  // Resolves with the declarations whose file could not be loaded - see DomRenderer.loadAssets.
  //
  // `rebuild` makes the loaders forget what they hold first, which is the only way a file whose
  // *bytes* changed under an unchanged path reaches the screen: the asset panel's replace. A flag
  // rather than a second member, because `loadAssets` already re-registers and loads and forgetting
  // first is a mode of what it does - and every implementation carries it, which is the cost of this
  // interface being deliberately minimal.
  loadAssets(state?: VnPlayerState, options?: { rebuild?: boolean }): Promise<DeclaredAsset[]>
}
