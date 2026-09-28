/// <reference types="@vitest/browser/providers/playwright" />
import { defineConfig } from "vitest/config"

// When the only display is a Wayland compositor (e.g. a waypipe-forwarded session on a
// headless VM), Chromium needs the ozone backend named explicitly -- Chrome for Testing
// defaults to X11, which is not there, and a headful launch just fails.
const chromiumArgs = process.env.WAYLAND_DISPLAY ? ["--ozone-platform=wayland"] : []

// Shared by both browser-backed projects. The desktop-sized viewport keeps the whole 1280x720
// vn canvas visible; the default is a 414x896 phone viewport. Watch a run with, e.g.:
//   yarn test:demo:headful
//
// A factory, not a constant: vitest names each nested browser project after the instance it
// finds and writes that name back onto the instance object, so two projects sharing one object
// collide with "the project name ... was already defined" as soon as both are run at once.
const browserConfig = () => ({
  enabled: true,
  provider: "playwright" as const,
  headless: true,
  viewport: { width: 1920, height: 1080 },
  instances: [{ browser: "chromium", launch: { args: chromiumArgs } }],
})

// **A server that answers without CORS headers**, for the one browser suite that has to meet one: Import
// from URL tells "that site does not send CORS headers" apart from "that site could not be reached".
// Vite sends the headers to any localhost origin by default, so every fixture was readable from any
// port or host name. Off for the browser project only - then a page on `localhost` reading the same
// server addressed as `127.0.0.1` is a real cross-origin request to a host that sends no CORS
// headers, which is test/browser/UrlImport.test.ts's `crossOrigin`. A plugin rather than the
// project's `server` block, because the browser server is built with a `server` block of vitest's
// own that replaces it; a plugin's config is merged in after.
const withoutCors = { name: "webvn:without-cors", config: () => ({ server: { cors: false } }) }

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        plugins: [withoutCors],
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          browser: browserConfig(),
        },
      },
      {
        // Full playthroughs of the demo story. These wait on real transitions and take ~30s, so
        // they are not part of `yarn test` -- run `yarn test:demo` (or `yarn test:all`).
        test: {
          name: "demo",
          include: ["test/demo/**/*.test.ts"],
          browser: browserConfig(),
        },
      },
    ],
  },
})
