import { RelativePathResolver } from "./assetLoaders/AssetResolver"
import { DeclaredAsset, seedState } from "./core/manifest"
import { VnPlayer } from "./core/player"
import { loadSaveData } from "./core/save"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { isServedFile, MANIFEST_FILE, SCRIPT_FILE } from "./publishedFolder"
import { decodePayload } from "./scriptUrl"
import { YamlParser } from "./yamlParser/YamlParser"

// The standalone player's boot, lifted out of `src/playerIndex.ts` for the reason `editorBoot.ts` was
// lifted out of `src/index.ts`: an entry point that boots itself on import and finds its elements by
// id is one no suite can reach, so whatever decides anything has to live somewhere a test can call.
// What is left in the entry point is wiring - the fullscreen button and the error line.
//
// **With no payload, the player plays the published folder it is served from**: it fetches
// `manifest.yaml` and `script.yaml` from that folder and resolves every asset against it. `dist/` is
// such a folder already, so the deployed demo plays exactly as it did - and the same player, dropped
// beside another project's files, plays that project. That is what makes a published folder play at
// all. With a payload it plays the payload, whose assets still resolve against the folder.

export interface PlayerBootOptions {
  // The vn root, laid out: the sub-renderers measure it in their constructors.
  readonly root: HTMLDivElement
  // What the scene is scaled inside when it goes fullscreen - see `DomRendererOptions`.
  readonly container?: HTMLElement
  // **The published folder's address, absolute and ending in `/`.** Told rather than worked out, as
  // `AppShell` is told its navigation: in production it is the page's own directory, and in a suite
  // it is the served `test-assets/` folder - a default would read the runner's own page.
  readonly folder: string
  // The `vn` query parameter, still encoded, or null when the address carries none.
  readonly payload: string | null
}

export interface BootedPlayer {
  readonly kind: "booted"
  readonly player: VnPlayer
  readonly renderer: DomRenderer
  // Declared files that could not be loaded. Reported rather than refused, as the editor does:
  // declaring before drawing is the normal authoring order, and a published folder that is missing
  // one is not something this player can fix. The console is the only place a player can say so.
  readonly missing: readonly DeclaredAsset[]
  // Resolves when the story comes to rest at its first stop. Hooked up before the story is handed
  // over, so a story that reaches it at once cannot be missed.
  readonly firstStop: Promise<void>
}

// Why nothing is playing, in one line a reader can be shown, and what to put in the console for
// whoever has to find out more.
export interface RefusedPlayer {
  readonly kind: "refused"
  readonly reason: string
  readonly details?: unknown
}

export type PlayerBoot = BootedPlayer | RefusedPlayer

const refuse = (problem: string, details?: unknown): RefusedPlayer => ({
  kind: "refused",
  reason: `The VN could not be loaded: ${problem}.`,
  details,
})

// A page opened from `file:` may not fetch its neighbours - Chrome refuses the scheme and Firefox
// gives every local file its own origin - so the YAML is what fails, while the images beside it
// would load. Extracting a published zip and double-clicking `index.html` is the first thing anyone
// tries, and a blank stage there looks like a bug rather than like a web host being needed.
const FROM_DISK =
  "it has to be opened from a web host, and opening index.html straight from your computer will not start it"

// Two text files from the folder, or the refusal that says which one did not come.
const fetchStory = async (folder: string): Promise<[string, string] | RefusedPlayer> => {
  const onDisk = new URL(folder).protocol === "file:"
  const texts: string[] = []
  for (const file of [MANIFEST_FILE, SCRIPT_FILE]) {
    const response = await fetch(new URL(file, folder)).catch((e: unknown) => e)
    if (!(response instanceof Response) || !isServedFile(response)) {
      return onDisk ? refuse(FROM_DISK, response) : refuse(`its ${file} would not load`, response)
    }
    texts.push(await response.text())
  }
  return [texts[0], texts[1]]
}

export const bootPlayer = async (options: PlayerBootOptions): Promise<PlayerBoot> => {
  let story: [string, string] | RefusedPlayer
  if (options.payload === null) story = await fetchStory(options.folder)
  else {
    // The demo is not a fallback for a payload that will not decode: a link that was meant to carry
    // a story and cannot is a dead end, and playing some other story would hide that it is one.
    story = await decodePayload(options.payload).catch((e: unknown) => refuse("its player link could not be read", e))
  }
  if (!Array.isArray(story)) return story
  const [manifestText, script] = story

  const [manifest, manifestErrors] = YamlParser.parseManifest(manifestText)
  // A manifest that does not validate has no identity to load the project under, so there is nothing
  // to fall back to - docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md.
  if (manifest === null) {
    return refuse(
      `its ${MANIFEST_FILE} does not parse`,
      manifestErrors.map((e) => `L${e.location.startLine}: ${e.message}`).join("\n")
    )
  }

  // **The story's title on the tab**, so a published VN is not one more tab called "WebVn". Set here
  // rather than by publish rewriting `index.html`: publish copies the player's files byte for byte and
  // never templates them, and a payload's manifest carries a title just the same.
  document.title = manifest.title

  const player = new VnPlayer(seedState(manifest), loadSaveData(manifest.id))
  const renderer = new DomRenderer(options.root, player, {
    container: options.container,
    resolver: new RelativePathResolver(options.folder),
  })

  const [state, scriptErrors] = YamlParser.parseStory(script, manifest)
  // Not a refusal: a script with a broken command still has content worth showing, and every
  // reference the manifest could not answer has already been neutralized - ADR 0002 and 0004. The
  // player has no gutter to mark, so the console is where the author is told, as below.
  if (scriptErrors.length > 0) {
    console.warn("Script errors:\n" + scriptErrors.map((e) => `L${e.location.startLine}: ${e.message}`).join("\n"))
  }
  const missing = await renderer.loadAssets(state)
  // The player has no tab to mark, but a declared file that is not there is worth saying somewhere
  // other than the frame it eventually throws on.
  if (missing.length > 0) {
    console.warn("Declared files that could not be loaded: " + missing.map((asset) => asset.path).join(", "))
  }

  const firstStop = new Promise<void>((resolve) => {
    const stopped = () => {
      if (!player.state.stopAfterRender) return
      renderer.onFinishedCallbacks.splice(renderer.onFinishedCallbacks.indexOf(stopped), 1)
      resolve()
    }
    renderer.onFinishedCallbacks.push(stopped)
  })
  // Animated, unlike the editor: everything the story runs before its first stop is played out,
  // which is what makes an intro or a title screen possible.
  renderer.loadStory(state, true)

  return { kind: "booted", player, renderer, missing, firstStop }
}

// The directory a page sits in, which is the published folder when the page is the player.
export const pageFolder = (href: string): string => new URL(".", href).href
