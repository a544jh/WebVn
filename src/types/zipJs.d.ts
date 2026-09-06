// `@zip.js/zip.js` is imported through the deep specifier `lib/zip-core-custom.js` rather than the
// package root - see `.scratch/project-archive/spec.md` for the measurement, and for the two reasons
// the root must not be imported. The package declares that path in its `exports` map, which webpack
// and vite both read; `tsconfig.json` is on `moduleResolution: "node"`, which predates `exports`
// maps entirely and so resolves the specifier to the `.js` file itself, dragging the library's
// source into the program under `allowJs`.
//
// So the types are pointed back at the package's own, which the root specifier resolves to
// perfectly well. One line of indirection rather than a second copy of anything: what this file
// asserts is that the pinned entry exports what the package does, which is true by construction -
// `zip-core-custom.js` is `zip-core-base.js` with a configuration call in front of it.
declare module "@zip.js/zip.js/lib/zip-core-custom.js" {
  export * from "@zip.js/zip.js"
}
