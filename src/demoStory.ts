import demoManifestYaml from "../test-assets/manifest.yaml?raw"
import { VnManifest } from "./core/manifest"
import { parseManifest } from "./yamlParser/parseManifest"

// The demo, as the test suites read it: its script, its raw manifest and that manifest parsed. **A
// test fixture, and nothing that ships imports it** - neither bundle carries a copy of the demo.
//
// The files live in test-assets/, which CopyPlugin copies to the dist root beside the assets/
// directory holding backgrounds/, sprites/ and audio/ - so the deployed demo is a published folder,
// laid out exactly as `src/publishedFolder.ts` says one is. The player plays it by fetching
// manifest.yaml and script.yaml from the folder it is served from (`src/playerBoot.ts`), and Add demo
// project reads it into the library as a URL import (`src/storage/urlImport.ts`). This module used to
// be how both of those got the demo, and its comment said it would have no reason to exist once they
// read the folder instead. That half came true; what is left is test/demo/DemoStory.test.ts, which
// drives the story through the harness rather than through a fetch, and the suites that need the
// demo's manifest to say what they expect.
//
// It could live in test/helpers/ now, and stays here only so that the suites and docs that name it
// did not have to move in the same change that made it a fixture. Its `?raw` imports are vite's.

export { default as demoYaml } from "../test-assets/script.yaml?raw"

// The raw manifest, alongside the raw script: the editor's manifest buffer and the URL payload both
// carry text rather than a parsed manifest, because round-tripping through the parser eats the
// comments an author wrote.
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
