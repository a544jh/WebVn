import { Base64 } from "js-base64"

// A story travels between the editor and the player as gzipped, url-safe base64 in the `vn` query
// parameter of player.html. The two halves have to agree on both the compression and the base64
// alphabet, so they live next to each other here.

export async function encodeScript(script: string): Promise<string> {
  const stringStream = new Response(new TextEncoder().encode(script)).body
  if (stringStream === null) {
    throw new Error("Could not read the script.")
  }
  const compressedStream = stringStream.pipeThrough(new CompressionStream("gzip"))
  const ab = await new Response(compressedStream).arrayBuffer()
  return Base64.fromUint8Array(new Uint8Array(ab), true)
}

export async function decodeScript(encoded: string): Promise<string> {
  // js-base64 declares toUint8Array as a bare Uint8Array, which TypeScript 5.9 widens to
  // Uint8Array<ArrayBufferLike>. BodyInit wants one backed by a plain ArrayBuffer, which is
  // what js-base64 allocates; only the declaration is imprecise.
  const bytes = Base64.toUint8Array(encoded) as Uint8Array<ArrayBuffer>
  const bufferStream = new Response(bytes).body
  if (bufferStream === null) {
    throw new Error("Could not read the encoded script.")
  }
  const decompressedStream = bufferStream.pipeThrough(new DecompressionStream("gzip"))
  return new Response(decompressedStream).text()
}

// player.html sits next to whichever page is asking, so resolving against the current document
// keeps the link working from the dev server, from the demo's Pages subdirectory and from a plain
// file path alike.
export function playerUrl(encoded: string, base: string): string {
  const url = new URL("player.html", base)
  url.searchParams.set("vn", encoded)
  return url.href
}
