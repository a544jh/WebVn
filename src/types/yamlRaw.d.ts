// `import script from "./story.yaml?raw"` - the file's text, not a parsed document. Vite supports
// the suffix natively (so it works in all three vitest projects) and webpack is taught it by the
// resourceQuery rule in webpack.config.js, which is why one spelling works in both.
declare module "*.yaml?raw" {
  const content: string
  export default content
}
