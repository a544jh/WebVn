import { loadAudio } from "./AudioAssetLoaderSrc"
import { loadImage } from "./ImageAssetLoaderSrc"

// What a file is, as far as this engine can use it: an image it can show, a sound it can play, or
// neither.
//
// **Asked of the bytes, through the loaders' own two functions**, rather than of `File.type`. That
// type is the browser's guess from the extension: empty for one it does not know, wrong for a file
// renamed by hand, and silent about whether this browser plays the format at all - an `.ogg` is
// `audio/ogg` in Safari too. Decoding with what the loaders use means a file the asset panel lets in
// as an image or as audio is one they will load, so its row does not go "won't load" on arrival - bar
// an SVG renamed away from `.svg` on its way in, which ROUGH_EDGES.md has.
export type Loadable = "image" | "audio"

// How long the audio half may take to answer. A local blob is ready in milliseconds, but `loadAudio`
// settles only on `canplaythrough` or `error`, and a browser that fires neither until something plays
// - mobile Safari's way with media it has not been asked to play - would leave Add asset waiting for
// ever with nothing on screen. No answer is counted as no: the author is told the file was refused
// rather than left looking at a panel that ignored their pick.
//
// **Here and not in `loadAudio`**, which the player shares: there a track comes over the network, a
// slow `canplaythrough` is a slow connection rather than a refusal, and a load that gave up would hand
// `AudioRenderer` a null it throws on.
export const AUDIO_ANSWER_MS = 10_000

export const loadableAs = async (file: Blob, audioAnswerMs = AUDIO_ANSWER_MS): Promise<Loadable | null> => {
  const url = URL.createObjectURL(file)
  try {
    // Both at once: each fails fast on the other kind's bytes, and neither has to wait for the other.
    const [image, audio] = await Promise.allSettled([loadImage(url), within(loadAudio(url), audioAnswerMs)])
    return image.status === "fulfilled" ? "image" : audio.status === "fulfilled" ? "audio" : null
  } finally {
    // Nothing keeps the elements: this asked a question, and the copy into the project is what the
    // loaders will load from.
    URL.revokeObjectURL(url)
  }
}

const within = <T>(answer: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms}ms`)), ms)
    answer.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
