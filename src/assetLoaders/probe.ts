import { loadAudio } from "./AudioAssetLoaderSrc"
import { loadImage } from "./ImageAssetLoaderSrc"

// What a file is, as far as this engine can use it: an image it can show, a sound it can play, or
// neither.
//
// **Asked of the bytes, through the loaders' own two functions**, rather than of `File.type`. That
// type is the browser's guess from the extension: empty for one it does not know, wrong for a file
// renamed by hand, and silent about whether this browser plays the format at all - an `.ogg` is
// `audio/ogg` in Safari too. Decoding with what the loaders use means a file the asset panel lets in
// as an image or as audio is one they will load, so its row cannot go "won't load" on arrival.
export type Loadable = "image" | "audio"

export const loadableAs = async (file: Blob): Promise<Loadable | null> => {
  const url = URL.createObjectURL(file)
  try {
    // Both at once: each fails fast on the other kind's bytes, and neither has to wait for the other.
    const [image, audio] = await Promise.allSettled([loadImage(url), loadAudio(url)])
    return image.status === "fulfilled" ? "image" : audio.status === "fulfilled" ? "audio" : null
  } finally {
    // Nothing keeps the elements: this asked a question, and the copy into the project is what the
    // loaders will load from.
    URL.revokeObjectURL(url)
  }
}
