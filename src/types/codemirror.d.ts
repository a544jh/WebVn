import "codemirror"

// `@types/codemirror` declares the two gutter methods on `Editor` only, at the pinned 0.0.109 and at
// the current 5.60.x alike. In codemirror.js both are defined on `Doc.prototype`, wrapped in
// `docMethodOp`, whose first line is the detached-doc path:
//
//   var cm = this.cm; if (!cm || cm.curOp) { return f.apply(this, arguments) }
//
// Marker data is stored on the line handle (`line.gutterMarkers`) and lines belong to the `Doc`, so
// a buffer that is not on screen can be marked and keeps its markers across the swap. They show up
// on `Editor` in the typings only because CM5 delegates every `Doc.prototype` method onto the editor
// except `iter insert remove copy getEditor constructor`.
//
// Load-bearing rather than incidental: adopting a manifest reparses the *script* while the
// *manifest* buffer is the visible one, so the script's error gutter is remarked while its doc is
// detached. Same global-augmentation pattern as src/types/screenOrientation.d.ts.
declare module "codemirror" {
  interface Doc {
    setGutterMarker(line: any, gutterID: string, value: HTMLElement | null): CodeMirror.LineHandle // eslint-disable-line @typescript-eslint/no-explicit-any
    clearGutter(gutterID: string): void
  }
}
