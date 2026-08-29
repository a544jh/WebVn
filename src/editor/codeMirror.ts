import * as CodeMirrorNamespace from "codemirror"

// `codemirror` is a CommonJS module whose export *is* the callable factory (`export =` in its
// typings). Webpack's interop hands `import * as` back that callable; vite and esbuild - which is
// what the browser test suites transpile through - hand back a namespace object carrying it on
// `default` instead, and calling that is a TypeError. One spelling has to work in both, so the
// unwrapping lives here rather than at the call sites.
//
// `import * as` stays the spelling because tsconfig has no `esModuleInterop`, and turning that on
// would change how every CommonJS dependency in the build is imported.
type CodeMirrorModule = typeof CodeMirrorNamespace

export const codeMirror: CodeMirrorModule =
  (CodeMirrorNamespace as CodeMirrorModule & { default?: CodeMirrorModule }).default ?? CodeMirrorNamespace
