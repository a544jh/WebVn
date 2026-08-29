import { Base64 } from "js-base64"
import { splitDocuments } from "./yamlParser/yamlDocument"

// The payload: a project's manifest and script, minus its assets, encoded into the `vn` query
// parameter of player.html so a story can be shared as a link. The two halves have to agree on both
// the compression and the base64 alphabet, so they live next to each other here.
//
// What is compressed is a two-document YAML stream: the manifest first, then the script. A payload
// carrying one document is refused rather than read as a script against some default manifest -
// docs/adr/0003-the-url-payload-carries-the-manifest.md says why, and it is the decision a later
// reader will want to undo.

// The transport, on its own: gzip and url-safe base64, over any text.
export async function encodeText(text: string): Promise<string> {
  const stringStream = new Response(new TextEncoder().encode(text)).body
  if (stringStream === null) {
    throw new Error("Could not read the text to encode.")
  }
  const compressedStream = stringStream.pipeThrough(new CompressionStream("gzip"))
  const ab = await new Response(compressedStream).arrayBuffer()
  return Base64.fromUint8Array(new Uint8Array(ab), true)
}

export async function decodeText(encoded: string): Promise<string> {
  // js-base64 declares toUint8Array as a bare Uint8Array, which TypeScript 5.9 widens to
  // Uint8Array<ArrayBufferLike>. BodyInit wants one backed by a plain ArrayBuffer, which is
  // what js-base64 allocates; only the declaration is imprecise.
  const bytes = Base64.toUint8Array(encoded) as Uint8Array<ArrayBuffer>
  const bufferStream = new Response(bytes).body
  if (bufferStream === null) {
    throw new Error("Could not read the encoded text.")
  }
  const decompressedStream = bufferStream.pipeThrough(new DecompressionStream("gzip"))
  return new Response(decompressedStream).text()
}

// The manifest text verbatim, not a re-serialisation of the parsed manifest: round-tripping through
// the parser eats comments, and the demo's manifest opens with six lines of them.
export function joinPayload(manifestText: string, script: string): string {
  const separator = manifestText.endsWith("\n") ? "" : "\n"
  return `${manifestText}${separator}---\n${script}`
}

export async function encodePayload(manifestText: string, script: string): Promise<string> {
  return encodeText(joinPayload(manifestText, script))
}

// Throws on a payload that is not two documents. One document is a link shared before the manifest
// travelled, and reading it as a script against the demo's manifest would give every shared story
// the same project id - which is to say the same save key, which is the collision keying saves by id
// exists to end. The player reports the failure rather than loading half a project.
export async function decodePayload(encoded: string): Promise<[string, string]> {
  const documents = splitDocuments(await decodeText(encoded))
  if (documents.length !== 2) {
    throw new Error(
      `A shared link carries a manifest and a script, in that order. This one carries ${documents.length}.`
    )
  }
  return [documents[0], documents[1]]
}

// player.html sits next to whichever page is asking, so resolving against the current document
// keeps the link working from the dev server, from the demo's Pages subdirectory and from a plain
// file path alike.
export function playerUrl(encoded: string, base: string): string {
  const url = new URL("player.html", base)
  url.searchParams.set("vn", encoded)
  return url.href
}
