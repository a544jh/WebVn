// Files an author could pick, with **real bytes**: the asset panel decodes a picked file before it
// asks anything about it (`src/assetLoaders/probe.ts`), so three made-up bytes are refused as neither
// an image nor a sound.

// One transparent pixel.
export const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="),
  (c) => c.charCodeAt(0)
)

// A tenth of a second of silence: PCM, one channel, 8 kHz, 16 bits.
export const WAV = ((): Uint8Array<ArrayBuffer> => {
  const samples = 800
  const view = new DataView(new ArrayBuffer(44 + samples * 2))
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, "RIFF")
  view.setUint32(4, 36 + samples * 2, true)
  ascii(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, samples * 2, true)
  return new Uint8Array(view.buffer)
})()

// As the platform hands one over: the type is the browser's guess from the extension, and the bytes
// are what the panel decodes.
export const pickedFile = (name: string, type = "image/png", bytes: BlobPart = PNG): File =>
  new File([bytes], name, { type })
