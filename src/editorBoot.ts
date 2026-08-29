import { seedState, VnManifest } from "./core/manifest"
import { VnPlayer } from "./core/player"
import { loadFromLocalStorage } from "./core/save"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import { OpfsAssetResolver } from "./storage/OpfsAssetResolver"
import { chooseProject, claimProject } from "./storage/openProject"
import { isSupported } from "./storage/opfs"
import { areLocksSupported, ProjectLock, takeProjectLock } from "./storage/projectLock"
import { readProject } from "./storage/projectStore"
import { ProjectStoring } from "./storage/projectStoring"
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
  // Held for the session, and released by this tab going away. `release` is here for tests; nothing
  // in the app calls it, because there is no project switching yet and switching is a teardown and
  // remount rather than a live swap.
  readonly lock: ProjectLock
  readonly player: VnPlayer
  readonly renderer: DomRenderer
  readonly editor: VnEditor
  readonly storing: ProjectStoring
  // The last step, handed back rather than taken, so a caller can finish wiring before the buffers
  // are filled: the export gate has to be listening before the load reports how the manifest fared.
  // A thunk rather than the two strings, so nobody can open the editor on the wrong project's text.
  readonly openProject: () => Promise<void>
}

export interface EditorElements {
  readonly vnDiv: HTMLDivElement
  readonly vnEditorDiv: HTMLDivElement
  readonly vnDivContainer?: HTMLElement
}

// Resolves once everything is built and wired. The story is not on screen until the returned
// `openProject` is called.
export const bootEditor = async (elements: EditorElements): Promise<EditorBoot> => {
  // A browser that cannot store gets no editor at all, rather than a memory-only one. A second boot
  // path that behaves differently and is exercised by nobody is a maintenance cost with no owner,
  // and an editor that silently cannot keep the author's work is worse than one that says so up
  // front. The blast radius is small on purpose: src/playerIndex.ts never touches OPFS, so the
  // *player* still works in any browser, and it is only authoring that needs a place to put things.
  //
  // navigator.locks needs a secure context exactly as OPFS does, so anything that can run the editor
  // can take a lock - but that is asserted here rather than assumed, and an absent LockManager
  // refuses rather than proceeding unlocked.
  if (!isSupported() || !areLocksSupported()) {
    return {
      kind: "refused",
      reason: "This browser cannot store projects, so the editor will not load. Try a recent Chrome or Edge.",
    }
  }

  // Ordering is the whole of ticket 06: choose without writing, take the lock, and only then seed,
  // open or store. A lock taken after the first store is a lock that was not there for the write it
  // was meant to protect, and a refused tab must not have written anything on its way to being
  // refused.
  const choice = await chooseProject()
  const lock = await takeProjectLock(choice.directory)
  if (lock === null) {
    // Not read-only mode, and not a banner over a mounted editor: read-only means an editor whose
    // stores are suppressed, which is the memory-only path this boot already refuses, arrived at
    // from a different direction.
    return {
      kind: "refused",
      reason: `"${choice.directory}" is already open in another tab. Close it and reload this one.`,
    }
  }
  await claimProject(choice)

  const directory = choice.directory
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

  let save
  try {
    // The key comes from the manifest that was just read - seedState copies `id` onto the state, so
    // a reload carries the save key with it.
    save = loadFromLocalStorage(openWith.id)
  } catch (e) {
    save = undefined
  }
  const player = new VnPlayer(seedState(openWith), save)

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
