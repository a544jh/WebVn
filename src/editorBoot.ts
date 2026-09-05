import { seedState, VnManifest } from "./core/manifest"
import { VnPlayer } from "./core/player"
import { loadSaveData } from "./core/save"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import { OpfsAssetResolver } from "./storage/OpfsAssetResolver"
import { isSupported } from "./storage/opfs"
import { areLocksSupported, ProjectLock, takeProjectLock } from "./storage/projectLock"
import { readProject, recordOpened } from "./storage/projectStore"
import { ProjectStoring } from "./storage/ProjectStoring"
import { YamlParser } from "./yamlParser/YamlParser"

// Opening a project out of the store: which one, read it, and build the player, renderer, editor and
// storer over it. Lifted out of src/index.ts so that a test exercises the boot that ships rather
// than a copy of it - the entry point keeps the parts a test could not run anyway, the element
// lookups and the refusal surface.
//
// The whole of this is asynchronous, where src/index.ts used to be synchronous top to bottom.

// The boot either produces an editor or refuses, and every refusal is one message with nothing
// mounted - the surface src/playerIndex.ts's showLoadError already set for the player. There are
// three reasons and no new UI for the two that arrived after the first.
export type EditorBoot = BootedEditor | RefusedBoot

export interface RefusedBoot {
  readonly kind: "refused"
  readonly reason: string
}

export interface BootedEditor {
  readonly kind: "booted"
  readonly directory: string
  // Held for as long as this project is open, and released by `close()` below or by the tab going
  // away. Exposed because a test asserts on it; the app reaches it through `close()`.
  readonly lock: ProjectLock
  readonly player: VnPlayer
  readonly renderer: DomRenderer
  readonly editor: VnEditor
  readonly storing: ProjectStoring
  // The last step, handed back rather than taken, so a caller can finish wiring before the buffers
  // are filled: the export gate has to be listening before the load reports how the manifest fared.
  // A thunk rather than the two strings, so nobody can open the editor on the wrong project's text.
  readonly openProject: () => Promise<void>
  // Puts the project down: flush what is pending, stop the storer, tear the renderer down, empty the
  // editor's root and release the lock. The thing that built the session is the thing that takes it
  // down, so the entry point keeps its one line of wiring.
  //
  // Resolves once the last store has landed, so a caller can await it before opening the next
  // project. That matters for a rename, where the next project is the same files under a different
  // directory.
  readonly close: () => Promise<void>
}

export interface EditorElements {
  readonly vnDiv: HTMLDivElement
  readonly vnEditorDiv: HTMLDivElement
  readonly vnDivContainer?: HTMLElement
}

// A browser that cannot store gets no editor at all, rather than a memory-only one. A second boot
// path that behaves differently and is exercised by nobody is a maintenance cost with no owner, and
// an editor that silently cannot keep the author's work is worse than one that says so up front. The
// blast radius is small on purpose: src/playerIndex.ts never touches OPFS, so the *player* still
// works in any browser, and it is only authoring that needs a place to put things.
//
// navigator.locks needs a secure context exactly as OPFS does, so anything that can run the editor
// can take a lock - but that is asserted here rather than assumed, and an absent LockManager refuses
// rather than proceeding unlocked.
//
// Exported because the picker renders *before* any boot and has to refuse the same browsers on the
// same terms. One message, one place: a second copy would be the one that goes stale.
export const unsupportedBrowserReason = (): string | null =>
  isSupported() && areLocksSupported()
    ? null
    : "This browser cannot store projects, so the editor will not load. Try a recent Chrome or Edge."

// Resolves once everything is built and wired. The story is not on screen until the returned
// `openProject` is called.
//
// **Told which directory to open rather than choosing one.** The picker is the front door and the
// author's pick is what names it; `chooseProject`'s "lastOpened, else the first listed" had two jobs
// and the picker took both, so it is gone rather than left with a contract that changed underneath
// it. A rename opens a directory nothing has ever listed, which is the other reason this is a
// parameter.
//
// `held` is for the one caller that has already taken the lock: a rename, which must know it can
// have the destination **before** it tears the old session down, since a refusal after that would
// leave the author with nothing mounted and their work already put down. Everyone else passes
// nothing and this takes the lock itself.
export const bootEditor = async (
  elements: EditorElements,
  directory: string,
  held?: ProjectLock
): Promise<EditorBoot> => {
  const unsupported = unsupportedBrowserReason()
  if (unsupported !== null) return { kind: "refused", reason: unsupported }

  // Ordering: the lock before anything is written. A lock taken after the first store is a lock that
  // was not there for the write it was meant to protect, and a refused tab must not have written
  // anything on its way to being refused - which is why `lastOpened` is recorded below it rather
  // than by whoever chose the directory.
  const lock = held ?? (await takeProjectLock(directory))
  if (lock === null) {
    // Not read-only mode, and not a banner over a mounted editor: read-only means an editor whose
    // stores are suppressed, which is the memory-only path this boot already refuses, arrived at
    // from a different direction.
    return {
      kind: "refused",
      reason: `"${directory}" is already open in another tab. Close it and reload this one.`,
    }
  }
  // Here rather than in the picker, so the one other caller - a rename, which reopens under a
  // directory the picker never showed - records what it opened without having to remember to.
  await recordOpened(directory)

  const { manifestText, scriptText } = await readProject(directory)

  const [manifest, manifestErrors] = YamlParser.parseManifest(manifestText)
  if (manifest === null) {
    // A stored manifest that does not parse must still open - that is the state the store
    // deliberately keeps listable, and refusing here would make the editor the one place an author
    // cannot go to fix it. Both buffers hold their real text, the gutter marks the problem, and the
    // preview runs under the placeholder below until the next blur adopts a manifest that parses.
    console.warn(
      "manifest.yaml does not parse:\n" + manifestErrors.map((e) => `L${e.location.startLine}: ${e.message}`).join("\n")
    )
  }
  const openWith = manifest ?? placeholderManifest(directory)

  // The key comes from the manifest that was just read - seedState copies `id` onto the state, so a
  // reload carries the save key with it.
  const player = new VnPlayer(seedState(openWith), loadSaveData(openWith.id))

  // The editor's resolver: an asset's bytes come out of this project's directory in OPFS. The
  // player keeps relative paths - design-docs/PROJECT_STORAGE.md's "the player and the editor get
  // different resolvers" is the steady state, not a migration.
  const renderer = new DomRenderer(elements.vnDiv, player, {
    container: elements.vnDivContainer,
    resolver: new OpfsAssetResolver(directory),
  })

  const editor = new VnEditor(elements.vnEditorDiv, player, YamlParser, renderer, openWith)

  // Storing, in the two lines it takes: the editor says what changed, the storer writes it, and the
  // editor shows what the storer reports. Neither imports the other.
  const storing = new ProjectStoring(directory, (state) => editor.setStoreState(state), elements.vnEditorDiv)
  editor.onBufferChangeCallbacks.push((buffer, text) => storing.changed(buffer, text))

  return {
    kind: "booted",
    directory,
    lock,
    player,
    renderer,
    editor,
    storing,
    openProject: () => editor.loadProject(manifestText, scriptText),
    close: async () => {
      // The storer first, and its flush is what makes closing lossless: an author who types and
      // immediately leaves has not waited out the debounce, and the interval's worth of typing is
      // theirs.
      await storing.stop()
      // Leaves the vn root holding the markup it was handed - the action bar is part of the page,
      // not part of the session - so the next renderer over the same element finds it.
      renderer.teardown()
      // The editor filled this one entirely, so emptying it is what "one editor after a remount"
      // means. CodeMirror keeps its DOM inside the wrapper it was given.
      elements.vnEditorDiv.innerHTML = ""
      // Last: everything that could still write has stopped, so the next tab - or the next boot in
      // this one - takes the lock over a project nobody is holding.
      await lock.release()
    },
  }
}

// What the preview runs under while the stored manifest does not parse. The directory names it,
// because a manifest that does not parse has declared no identity and the directory is the only name
// the project actually has. Nothing is written back: an id is the manifest's to declare.
const placeholderManifest = (directory: string): VnManifest => ({
  id: directory,
  title: directory,
  actors: {},
  backgrounds: {},
  audioAssets: {},
})
