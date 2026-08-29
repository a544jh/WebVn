import demoManifestYaml from "../test-assets/manifest.yaml?raw"
import { VnManifest } from "./core/manifest"
import { parseManifest } from "./yamlParser/parseManifest"

// The demo VN shipped by the standalone player (src/playerIndex.ts). Kept in its own module so
// test/demo/DemoStory.test.ts exercises the script that actually ships instead of a copy of it.
//
// The files live in test-assets/, which CopyPlugin copies to the dist root beside backgrounds/,
// sprites/ and audio/ - so the demo is a published project directory, which is what URL import
// will later read back.
//
// Parsing the manifest here, at module load, is scaffolding rather than architecture: once the
// player parses manifest.yaml at boot - URL import first, then OPFS - the demo becomes an ordinary
// project loaded through the normal path and this module has no reason to exist.

export { default as demoYaml } from "../test-assets/script.yaml?raw"

// The raw manifest, alongside the raw script: the editor's manifest buffer and the URL payload both
// carry text rather than a parsed manifest, because round-tripping through the parser eats the
// comment block this file opens with.
export { demoManifestYaml }

const [manifest, manifestErrors] = parseManifest(demoManifestYaml)

// Type narrowing, not the validation mechanism: the guarantee is a unit test asserting the demo's
// manifest parses with zero errors, which runs in the fast gate.
if (manifest === null) {
  throw new Error(
    "test-assets/manifest.yaml does not parse: " + manifestErrors.map((e) => `L${e.location.startLine}: ${e.message}`)
  )
}

export const demoManifest: VnManifest = manifest
