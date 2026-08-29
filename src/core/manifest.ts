import { ConsecutiveIntegerSet } from "../lib/ConsecutiveIntegerSet"
import { Actor, Actors, AudioAsset, DefaultActor, NARRATOR_ACTOR_ID, TextMode, VnPlayerState } from "./state"

// What a project declares about itself: its identity, who can speak, and which background and audio
// assets exist. An input to the parser, not a live field - `seedState` copies the asset declarations
// into a starting state, which carries `actors`/`backgrounds`/`audioAssets` from there on.
//
// The three declarations are keyed maps rather than lists because the script names an id and the
// manifest says which file it is: the manifest is a symbol table, not just a preload index. That is
// what lets a file be renamed without touching the story, and what gives an audio asset somewhere
// to carry a title.
//
// `id` and `title` are identity rather than content: `id` is what saves are keyed under and what
// names the project's directory, `title` is display-only. Keeping them here rather than in a
// wrapping type is `docs/adr/0001-manifest-seeds-the-initial-state.md`'s 2026-08-28 amendment;
// `seedState` copying them into the state, so that a reload carries the save key with it, is that
// ADR's 2026-08-29 one.
export interface VnManifest {
  readonly id: string
  readonly title: string
  readonly actors: Record<string, Actor>
  readonly backgrounds: Record<string, string>
  readonly audioAssets: Record<string, AudioAsset>
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
//
// The manifest is required rather than defaulted: a no-argument call would mint a state with no
// identity, which is the thing `id` exists to prevent. Tests that do not care use `TEST_MANIFEST`
// from `test/helpers/testManifest.ts`.
export function seedState(manifest: VnManifest): VnPlayerState {
  return {
    id: manifest.id,
    title: manifest.title,
    actors: seedActors(manifest),
    backgrounds: { ...manifest.backgrounds },
    audioAssets: { ...manifest.audioAssets },
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
