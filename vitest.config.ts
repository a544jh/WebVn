import { defineConfig } from "vitest/config"

// When the only display is a Wayland compositor (e.g. a waypipe-forwarded session on a
// headless VM), Chromium needs the ozone backend named explicitly -- Chrome for Testing
// defaults to X11, which is not there, and a headful launch just fails.
const chromiumArgs = process.env.WAYLAND_DISPLAY ? ["--ozone-platform=wayland"] : []

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            // Desktop-sized viewport so the whole 1280x720 vn canvas is visible
            // (default is a 414x896 phone viewport). Watch the tests with:
            //   npx vitest --project browser --browser.headless=false
            viewport: { width: 1920, height: 1080 },
            instances: [{ browser: "chromium", launch: { args: chromiumArgs } }],
          },
        },
      },
    ],
  },
})
