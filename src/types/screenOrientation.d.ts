// TypeScript 5.9 dropped ScreenOrientation.lock (and OrientationLockType) from lib.dom.d.ts,
// because the locking half of the Screen Orientation API is unimplemented on desktop Safari
// and Firefox. Chrome and the mobile browsers still ship it, and locking to landscape is the
// whole point of the fullscreen button on a phone, so declare it back. Every call site
// catches the rejection the browsers without it produce.

type OrientationLockType =
  | "any"
  | "landscape"
  | "landscape-primary"
  | "landscape-secondary"
  | "natural"
  | "portrait"
  | "portrait-primary"
  | "portrait-secondary"

interface ScreenOrientation {
  lock(orientation: OrientationLockType): Promise<void>
}
