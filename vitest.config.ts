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

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts", "src/**/*.demo.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: browserConfig(),
        },
      },
      {
        // Full playthroughs of the demo story. These wait on real transitions and take ~30s, so
        // they are not part of `yarn test` -- run `yarn test:demo` (or `yarn test:all`).
        test: {
          name: "demo",
          include: ["src/**/*.demo.test.ts"],
          browser: browserConfig(),
        },
      },
    ],
  },
})
