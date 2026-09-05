// The one piece of the File System Access API that src/storage/opfs.ts uses and lib.dom.d.ts does
// not declare. A global augmentation with no imports or exports, picked up because tsconfig.json has
// no `include` - the same shape and the same reason as src/types/screenOrientation.d.ts.
//
// `FileSystemFileHandle.move()` was declared here too until 2026-08-30, when the tmp-then-move write
// that needed it was dropped - see writeNow in src/storage/opfs.ts. It is a Chromium addition rather
// than a spec method, so a caller wanting it will need this back along with a feature detect.
//
// Everything else src/storage/opfs.ts uses is already declared: navigator.storage.getDirectory(),
// estimate(), persist(), persisted(), createWritable(), getFileHandle, getDirectoryHandle and
// removeEntry are all present.

// Async iteration over a directory's entries. TypeScript does declare these, but in
// lib.dom.asynciterable.d.ts, which is only pulled in by a `lib` naming DOM.AsyncIterable - and this
// project compiles at `target: es6` with no `lib`, so it is not loaded. Adding the lib instead would
// pull in every other async iterable declaration as well; three signatures is the smaller change.
// `for await` over these compiles fine at es6.
interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<FileSystemHandle>
}
