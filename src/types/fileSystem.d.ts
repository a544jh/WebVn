// Two pieces of the File System Access API that Chromium implements and lib.dom.d.ts does not
// declare, for two different reasons. A global augmentation with no imports or exports, picked up
// because tsconfig.json has no `include` - the same shape and the same reason as
// src/types/screenOrientation.d.ts.
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

// move() is absent because it is not in the WHATWG File System spec at all - it is a Chromium
// addition, which is also why src/storage/opfs.ts feature-detects it on the handle before using it
// rather than trusting this declaration. It is what makes a write atomic: write beside the target,
// then move into place.
interface FileSystemFileHandle {
  move(name: string): Promise<void>
  move(parent: FileSystemDirectoryHandle, name?: string): Promise<void>
}
