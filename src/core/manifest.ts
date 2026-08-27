import { ConsecutiveIntegerSet } from "../lib/ConsecutiveIntegerSet"
import { Actor, Actors, DefaultActor, NARRATOR_ACTOR_ID, TextMode, VnPlayerState } from "./state"

// Everything a story needs that its script does not spell out: who can speak, and which background
// and audio assets exist. An input to the parser, not a live field - `seedState` copies it into a
// starting state, which carries `actors`/`backgrounds`/`audioAssets` from there on.
export interface VnManifest {
  readonly actors: Record<string, Actor>
  readonly backgrounds: string[]
  readonly audioAssets: string[]
}

export const EMPTY_MANIFEST: VnManifest = {
  actors: {},
  backgrounds: [],
  audioAssets: [],
}

// The engine's own actors, which every project gets without declaring them: the default actor all
// others inherit from, and the unnamed narrator.
const DEFAULT_ACTOR: DefaultActor = {
  textColor: "white",
  nameTagColor: "white",
}

// The manifest's actors go over the engine's. The default actor merges field by field, so a project
// can override just its text colour and keep the rest; every other entry, the narrator included,
// replaces whatever was there.
function seedActors(manifest: VnManifest): Actors {
  return {
    ...manifest.actors,
    default: { ...DEFAULT_ACTOR, ...manifest.actors.default },
    [NARRATOR_ACTOR_ID]: manifest.actors[NARRATOR_ACTOR_ID] ?? {},
  }
}

// The state a story begins in: the manifest's declarations plus a playhead at the top. Every call
// mints its own `seenCommands`, so two players seeded from one manifest never share a set.
export function seedState(manifest: VnManifest = EMPTY_MANIFEST): VnPlayerState {
  return {
    actors: seedActors(manifest),
    backgrounds: [...manifest.backgrounds],
    audioAssets: [...manifest.audioAssets],
    commandIndex: 0, // the command to be applied next
    commands: [],
    labels: {},
    stopAfterRender: false,
    mode: TextMode.ADV,
    animatableState: {
      text: null,
      freeformInsertionPoint: { x: 0, y: 0, width: 1 },
      freeformText: [],
      sprites: {},
      background: {
        image: "#FFFFFF",
        panDuration: 0,
        panFrom: { x: 0, y: 0, w: 0, h: 0 },
        panTo: { x: 0, y: 0, w: 0, h: 0 },
        waitForPan: false,
        transition: "fade",
        transitionDuration: 0,
        shouldTransition: false,
      },
      audio: {
        bgm: null,
        loopBgm: true,
        sfx: null,
      },
    },
    decision: null,
    variables: {},
    seenCommands: new ConsecutiveIntegerSet(),
  }
}
