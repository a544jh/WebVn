import { VnManifest } from "../../src/core/manifest"

// The manifest for a test that does not care what a project declares - the successor to
// EMPTY_MANIFEST, which stopped being a truthful name once `id` and `title` became required. It
// lives here rather than in src/ because a manifest with a placeholder identity is a test fixture:
// in production every manifest comes from a real manifest.yaml.
export const TEST_MANIFEST: VnManifest = {
  id: "test-story",
  title: "Test Story",
  actors: {},
  backgrounds: [],
  audioAssets: [],
}
