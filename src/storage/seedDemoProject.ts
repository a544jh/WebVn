import { seedState } from "../core/manifest"
import { demoManifest, demoManifestYaml, demoYaml } from "../demoStory"
import { declaredAssets } from "../domRenderer/assetPaths"
import { createProject, writeProjectFile } from "./projectStore"

// Its own file so that its deletion condition is a file deletion. It is also the one thing in
// src/storage/ that knows what a demo, a manifest's declarations or an asset path is - keeping it
// here is what stops those imports leaking into the layer that is only supposed to know about
// yamlParser.

// Scaffolding, and its deletion condition needs *two* things: the picker **and** URL import. The
// seed is doing two jobs. It keeps the editor alive - with no picker an empty library is not a blank
// page, it is a hard failure, and the picker's "new project" is what retires that half
// (`createProject` with no files is already the call). And it makes first run good, which is the
// demo specifically, and only a URL import of the demo published in dist/ retires that. Delete it
// after the picker alone and a new author's first experience becomes an empty project instead of a
// story, which is worse than today. So this survives tranche 2 and dies in tranche 3.
//
// Written through `createProject`, so there is one code path for "put a project into the store"
// rather than two.
export const seedDemoProject = async (): Promise<void> => {
  await createProject(demoManifest.id, { manifestText: demoManifestYaml, scriptText: demoYaml })

  // The two YAML files are not the whole project: the editor's resolver reads an asset out of the
  // store, so a demo seeded without its media would open with every declared file reported missing.
  // They are fetched from where CopyPlugin published them, beside index.html - which is the same
  // directory a URL import will eventually read, and one more reason this is the shape to delete
  // rather than a shape to keep.
  const { images, audio } = declaredAssets(seedState(demoManifest))
  await Promise.all(
    [...images, ...audio].map(async (asset) => {
      const response = await fetch(asset.path).catch(() => null)
      // A file that will not fetch is left out rather than failing the seed, matching what the rest
      // of this codebase does with a declared file that is not there: it is reported when the story
      // reaches it, on the manifest line that declared it.
      if (response === null || !response.ok) {
        console.warn(`Could not seed ${asset.path} into the demo project`)
        return
      }
      await writeProjectFile(demoManifest.id, asset.path, await response.blob())
    })
  )
}
